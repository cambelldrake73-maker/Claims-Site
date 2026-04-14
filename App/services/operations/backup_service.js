const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const { db, DB_PATH, get } = require('../claim_ingestion_api/db');
const { STORAGE_ROOT, LEGACY_STORAGE_ROOT } = require('../storage/file_storage');

const BACKUP_ROOT = path.resolve(
  process.env.REVCAPTURE_BACKUP_ROOT || path.join(os.homedir(), '.revcapture', 'backups')
);

let activeBackupPromise = null;

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

async function safeStat(targetPath) {
  try {
    return await fsPromises.stat(targetPath);
  } catch (err) {
    return null;
  }
}

function formatBackupTimestamp(timestamp) {
  const date = new Date(Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now());
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  const millis = String(date.getUTCMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}T${hour}${minute}${second}${millis}Z`;
}

async function createUniqueBackupDirectory(rootPath, createdAt) {
  const baseId = formatBackupTimestamp(createdAt);

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const backupId = suffix === 0
      ? baseId
      : `${baseId}-${String(suffix).padStart(3, '0')}`;
    const backupDir = path.join(rootPath, backupId);

    try {
      await fsPromises.mkdir(backupDir, { recursive: false });
      return { backupId, backupDir };
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        continue;
      }

      throw err;
    }
  }

  throw new Error('Unable to allocate a unique backup directory');
}

function listStorageRoots() {
  const seenPaths = new Set();
  const roots = [];

  for (const entry of [
    { label: 'primary', path: STORAGE_ROOT },
    { label: 'legacy', path: LEGACY_STORAGE_ROOT }
  ]) {
    const resolvedPath = path.resolve(entry.path);

    if (seenPaths.has(resolvedPath)) {
      continue;
    }

    seenPaths.add(resolvedPath);
    roots.push({
      label: entry.label,
      path: resolvedPath
    });
  }

  return roots;
}

async function countFilesRecursive(rootPath) {
  const exists = await pathExists(rootPath);

  if (!exists) {
    return 0;
  }

  let total = 0;
  const queue = [rootPath];

  while (queue.length) {
    const currentPath = queue.pop();
    const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile()) {
        total += 1;
      }
    }
  }

  return total;
}

async function getCount(sql, params = []) {
  try {
    const row = await get(sql, params);
    return Number.isFinite(Number(row?.count)) ? Number(row.count) : 0;
  } catch (err) {
    if (
      err
      && err.code === 'SQLITE_ERROR'
      && /(no such table|no such column)/i.test(String(err.message || ''))
    ) {
      return 0;
    }

    throw err;
  }
}

async function collectDatabaseCounts() {
  const [
    claims,
    uploads,
    intakeFiles,
    storedLocalFiles,
    auditLogs
  ] = await Promise.all([
    getCount(`SELECT COUNT(*) AS count FROM claims`),
    getCount(`SELECT COUNT(*) AS count FROM uploads`),
    getCount(`SELECT COUNT(*) AS count FROM intake_files`),
    getCount(
      `SELECT COUNT(*) AS count
       FROM intake_files
       WHERE storage_backend = 'local'
         AND storage_key IS NOT NULL`
    ),
    getCount(`SELECT COUNT(*) AS count FROM audit_logs`)
  ]);

  return {
    claims,
    uploads,
    intake_files: intakeFiles,
    stored_local_files: storedLocalFiles,
    audit_logs: auditLogs
  };
}

async function getOperationalIntegritySnapshot() {
  const checkedAt = Date.now();
  const dbStat = await safeStat(DB_PATH);
  const storageRoots = listStorageRoots();
  const storageRootDetails = [];

  for (const storageRoot of storageRoots) {
    const stat = await safeStat(storageRoot.path);
    const exists = Boolean(stat && stat.isDirectory());
    const fileCount = exists ? await countFilesRecursive(storageRoot.path) : 0;

    storageRootDetails.push({
      label: storageRoot.label,
      path: storageRoot.path,
      exists,
      file_count: fileCount
    });
  }

  const databaseCounts = dbStat ? await collectDatabaseCounts() : {
    claims: 0,
    uploads: 0,
    intake_files: 0,
    stored_local_files: 0,
    audit_logs: 0
  };
  const totalDiskFileCount = storageRootDetails.reduce(
    (sum, entry) => sum + Number(entry.file_count || 0),
    0
  );
  const primaryRoot = storageRootDetails.find(entry => entry.label === 'primary') || null;
  const warnings = [];

  if (!dbStat || !dbStat.isFile()) {
    warnings.push('Database file is missing');
  }

  if (!primaryRoot || !primaryRoot.exists) {
    warnings.push('Primary file storage root is missing');
  }

  if (databaseCounts.stored_local_files !== totalDiskFileCount) {
    warnings.push('Tracked local file count does not match files present on disk');
  }

  return {
    checked_at: checkedAt,
    ok: warnings.length === 0,
    checks: {
      database_present: Boolean(dbStat && dbStat.isFile()),
      primary_storage_root_present: Boolean(primaryRoot && primaryRoot.exists),
      tracked_file_count_matches_disk: databaseCounts.stored_local_files === totalDiskFileCount
    },
    database: {
      path: DB_PATH,
      exists: Boolean(dbStat && dbStat.isFile()),
      size_bytes: Number.isFinite(Number(dbStat?.size)) ? Number(dbStat.size) : 0
    },
    storage_roots: storageRootDetails,
    counts: {
      ...databaseCounts,
      disk_files_total: totalDiskFileCount
    },
    warnings
  };
}

async function runDatabaseBackup(destinationPath) {
  await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    const backup = db.backup(destinationPath);

    function finish(err) {
      if (settled) {
        return;
      }

      settled = true;

      if (err) {
        reject(err);
        return;
      }

      resolve({
        page_count: Number.isFinite(Number(backup.pageCount)) && Number(backup.pageCount) >= 0
          ? Number(backup.pageCount)
          : null
      });
    }

    backup.on('error', finish);
    backup.finish(finish);
  });
}

async function copyStorageRootSnapshot(sourcePath, destinationPath) {
  const exists = await pathExists(sourcePath);

  if (!exists) {
    return {
      source_path: sourcePath,
      backup_path: destinationPath,
      exists: false,
      copied: false,
      file_count: 0
    };
  }

  await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsPromises.cp(sourcePath, destinationPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true
  });

  return {
    source_path: sourcePath,
    backup_path: destinationPath,
    exists: true,
    copied: true,
    file_count: await countFilesRecursive(destinationPath)
  };
}

async function writeBackupMetadata(metadataPath, metadata) {
  await fsPromises.writeFile(
    metadataPath,
    JSON.stringify(metadata, null, 2),
    'utf8'
  );
}

async function createBackup(options = {}) {
  if (activeBackupPromise) {
    const err = new Error('Backup is already in progress');
    err.code = 'BACKUP_IN_PROGRESS';
    throw err;
  }

  const backupRoot = path.resolve(
    normalizeString(options.backup_root || options.backupRoot)
      || process.env.REVCAPTURE_BACKUP_ROOT
      || BACKUP_ROOT
  );

  activeBackupPromise = (async () => {
    const createdAt = Date.now();
    let backupId = null;
    let backupDir = null;
    let integrityBefore = null;

    try {
      await fsPromises.mkdir(backupRoot, { recursive: true });
      const allocation = await createUniqueBackupDirectory(backupRoot, createdAt);
      backupId = allocation.backupId;
      backupDir = allocation.backupDir;
      integrityBefore = await getOperationalIntegritySnapshot();

      const dbBackupPath = path.join(backupDir, 'db.sqlite');
      const filesBackupRoot = path.join(backupDir, 'files');
      const databaseBackup = await runDatabaseBackup(dbBackupPath);
      const fileSnapshots = [];

      for (const storageRoot of listStorageRoots()) {
        fileSnapshots.push(
          await copyStorageRootSnapshot(
            storageRoot.path,
            path.join(filesBackupRoot, storageRoot.label)
          )
        );
      }

      const copiedFileCount = fileSnapshots.reduce(
        (sum, snapshot) => sum + Number(snapshot.file_count || 0),
        0
      );
      const warnings = [...(integrityBefore?.warnings || [])];

      if (
        integrityBefore
        && Number(integrityBefore.counts?.stored_local_files || 0) !== copiedFileCount
      ) {
        warnings.push('Backed up file count does not match tracked local file rows');
      }

      const metadata = {
        backup_id: backupId,
        created_at: createdAt,
        status: warnings.length ? 'warning' : 'ok',
        backup_root: backupRoot,
        backup_dir: backupDir,
        database: {
          source_path: DB_PATH,
          backup_path: dbBackupPath,
          page_count: databaseBackup.page_count
        },
        files: {
          snapshots: fileSnapshots
        },
        integrity: integrityBefore,
        warnings
      };

      await writeBackupMetadata(path.join(backupDir, 'metadata.json'), metadata);
      return metadata;
    } catch (err) {
      if (backupDir) {
        try {
          await writeBackupMetadata(path.join(backupDir, 'metadata.json'), {
            backup_id: backupId,
            created_at: createdAt,
            status: 'failed',
            backup_root: backupRoot,
            backup_dir: backupDir,
            integrity: integrityBefore,
            error: err.message
          });
        } catch (metadataErr) {
          console.error('Failed to write backup failure metadata', metadataErr);
        }
      }

      throw err;
    }
  })();

  try {
    return await activeBackupPromise;
  } finally {
    activeBackupPromise = null;
  }
}

module.exports = {
  BACKUP_ROOT,
  createBackup,
  getOperationalIntegritySnapshot
};

const express = require('express');
const router = express.Router();

const { requireOperatorRole } = require('../claim_ingestion_api/role_middleware');
const { authenticateRequest, issueAuthToken } = require('./auth_middleware');
const {
  authenticateUserByPassword,
  buildAuthContextFromUser,
  createUser,
  rotateUserTokenVersion,
  updateUser
} = require('./user_model');

function shapeUserResponse(user) {
  if (!user) {
    return null;
  }

  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    provider_id: user.provider_id ?? null,
    customer_id: user.customer_id ?? null,
    is_active: user.is_active === true,
    created_at: user.created_at ?? null,
    updated_at: user.updated_at ?? null
  };
}

router.post('/login', async (req, res) => {
  try {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: 'email and password are required'
      });
    }

    const user = await authenticateUserByPassword(email, password);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid email or password'
      });
    }

    const { token, payload } = issueAuthToken(buildAuthContextFromUser(user));

    return res.json({
      ok: true,
      token,
      expires_at: Number(payload.exp) * 1000,
      user: shapeUserResponse(user)
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/logout', authenticateRequest, async (req, res) => {
  try {
    if (!req.identity || !req.identity.user_id) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHENTICATED'
      });
    }

    if (req.identity?.is_dev_bypass) {
      return res.json({ ok: true });
    }

    await rotateUserTokenVersion(req.identity?.user_id, Date.now());

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/me', authenticateRequest, async (req, res) => {
  if (!req.identity || !req.identity.user_id) {
    return res.status(401).json({
      ok: false,
      error: 'UNAUTHENTICATED'
    });
  }

  return res.json({
    ok: true,
    user: {
      user_id: req.identity?.user_id ?? null,
      email: req.identity?.email ?? null,
      role: req.identity?.role ?? null,
      provider_id: req.identity?.provider_id ?? null,
      customer_id: req.identity?.customer_id ?? null
    }
  });
});

router.post('/users', authenticateRequest, requireOperatorRole, async (req, res) => {
  if (!req.identity || !req.identity.user_id) {
    return res.status(401).json({
      ok: false,
      error: 'UNAUTHENTICATED'
    });
  }
  if (req.body?.provider_id || req.body?.customer_id) {
    return res.status(400).json({
      ok: false,
      error: 'CLIENT_CANNOT_SET_IDENTITY_FIELDS'
    });
  }

  try {
    const user = await createUser({
      email: req.body?.email,
      password: req.body?.password,
      role: req.body?.role,
      provider_id: req.identity.provider_id,
      customer_id: req.identity.customer_id,
      is_active: req.body?.is_active
    });

    return res.status(201).json({
      ok: true,
      user: shapeUserResponse(user)
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

router.patch('/users/:id', authenticateRequest, requireOperatorRole, async (req, res) => {
  if (!req.identity || !req.identity.user_id) {
    return res.status(401).json({
      ok: false,
      error: 'UNAUTHENTICATED'
    });
  }

  try {
    const user = await updateUser(req.params.id, {
      is_active: req.body?.is_active,
      password: req.body?.password
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'User not found'
      });
    }

    return res.json({
      ok: true,
      user: shapeUserResponse(user)
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;

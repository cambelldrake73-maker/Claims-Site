
- Fix the truncated JavaScript in `submit-claims.html` — the `document.addEventListener('click'` handler is cut off and missing the `aria-expanded` reset and closing braces
- Add a loading/disabled state to the Submit Claim button after form submission to prevent duplicate clicks
- Make the `savedNotice` span in `submit-claims.html` auto-hide after a few seconds using a CSS transition or `setTimeout`
- Add a pin/unpin visual indicator to the sidebar-tab button so users understand its toggle function (e.g., rotate arrow icon like `agreements.html` already does, but `submit-claims.html` is missing this)

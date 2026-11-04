# The browser extension

Manifest V3, built from [`overlay/assay.user.js`](../overlay/assay.user.js) by
[`scripts/build-extension.mjs`](../scripts/build-extension.mjs). Edit the userscript, never the build output.

```sh
npm run extension        # → extension/dist/ (load unpacked) and extension/assay-extension.zip (for the stores)
```

- Permissions: `storage` (two settings), host access to `https://assay.meex.work/*`; content script on `https://pump.fun/*`.
- No background worker, no remote code, no wallet access. The privacy policy is https://assay.meex.work/privacy.
- Store listings (Chrome Web Store, Firefox Add-ons) are submitted by hand from the zip, registered to SHYGUY LLC.

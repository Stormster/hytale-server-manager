# Pro Plugin Architecture

## Repo split

| Repo | Purpose |
|------|---------|
| **Public** (this repo) | Open core. Plugin interface + loader. No Pro implementation. |
| **Private** ([hytale-server-manager-pro](https://github.com/Stormster/hytale-server-manager-pro)) | Pro plugin source, builds `pro_plugin.whl`. Never merged into public. |

## User flow

1. **Patreon linking** – User links Patreon on your website. Site checks membership via Patreon API.
2. **If active** – Show download link for `HSM-Pro-Plugin-{version}.whl` + license key.
3. **App** – User drops `.whl` in `plugins/`, enters key in Settings or Sign-in page.
4. **Validation** – Keys are cryptographically signed. App validates locally (public key embedded). Optional periodic online check for subscription status.
5. **Low friction** – Token stored locally; Sign-in page enables Pro with minimal steps. Offline key activation supported.

## Safeguards against leaking Pro code

- `.gitignore`: `backend/pro_plugin/`, `pro_plugin/`, `backend/plugins/*.whl`, `*.pyz`
- CI workflow (`.github/workflows/check-no-pro-leak.yml`): Fails push/PR if Pro source dirs exist
- Develop Pro only in the private repo; never add it as submodule or copy into public

# Pro plugins

Place `pro_plugin.whl` or `pro_plugin.pyz` here to enable Pro features.

- **Open core**: This folder is empty in the public repo. Pro code is distributed separately to Patreon supporters.
- **Distribution**: Patreon users receive a download link to the plugin file and a license key.
- **License**: Enter the key in Settings. The plugin validates it when registering.
- **Package format**: The plugin must expose a top-level `pro_plugin` package with a class implementing `ProPlugin` (see `plugin_interface.py`).

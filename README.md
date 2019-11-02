# edge-extension-deploy

Deploy Edge extensions to the Windows Store.

## Installation

`npm install --save-dev edge-extension-deploy`

## Usage

```js
var fs = require('fs');
var deploy = require('edge-extension-deploy');

deploy({
  // Azure AD credentials
  tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientSecret: 'bXlDbGllbnRTZWNyZXQ=',

  // Windows Store ID of the extension (from the Dev Center dashboard)
  appId: '123456789ABC',

  // OPTIONAL: if specified, will push a flight submission instead of the main submission
  flightId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',

  // ReadStream of an (unsigned) appx
  appx: fs.createReadStream('path/to/extension.appx')
}).then(function() {
  // success!
}, function(err) {
  // failure :(
  // errors are sanitized, so your tokens will not be leaked
});
```

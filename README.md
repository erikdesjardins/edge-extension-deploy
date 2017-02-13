# edge-extension-deploy [![Build Status](https://travis-ci.org/erikdesjardins/edge-extension-deploy.svg?branch=master)](https://travis-ci.org/erikdesjardins/edge-extension-deploy) [![Coverage Status](https://coveralls.io/repos/github/erikdesjardins/edge-extension-deploy/badge.svg?branch=master)](https://coveralls.io/github/erikdesjardins/edge-extension-deploy?branch=master)

Deploy Edge extensions to the Windows Store.

## Installation

`npm install --save-dev edge-extension-deploy`

## Usage

Note: `edge-extension-deploy` requires `Promise` support.
If your environment does not natively support promises, you'll need to provide [your own polyfill](https://github.com/floatdrop/pinkie).

```js
var fs = require('fs');
var deploy = require('edge-extension-deploy');

deploy({

}).then(function() {
  // success!
}, function(err) {
  // failure :(
});
```

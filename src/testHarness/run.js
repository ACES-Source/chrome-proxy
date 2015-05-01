/* globals mocha, phantom */
/**
 * Test runner
 * Using phantomjs to render page and execute scripts
 *
 * Example: phantomjs test/run.js
 */

var node_modules = '../../node_modules/';
phantom.injectJs(node_modules + 'mocha/mocha.js');
phantom.injectJs(node_modules + 'sinon-chrome/phantom-tweaks.js');

mocha.setup({ui: 'bdd', reporter: 'spec'});

phantom.injectJs('beforeeach.js');
phantom.injectJs('../../dist/background.js');
//phantom.injectJs('../modules/keepkeyjs/transport.js')
//phantom.injectJs('../modules/keepkeyjs/transport_hid.js')
phantom.injectJs('../background.spec.js');

mocha.run(function(failures) {
    // setTimeout is needed to supress "Unsafe JavaScript attempt to access..."
    // see https://github.com/ariya/phantomjs/issues/12697
    setTimeout(function() {
        phantom.exit(failures);
    }, 0);
});
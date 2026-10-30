(function (namespace) {
    'use strict';

    if (!namespace.core || !namespace.ui) {
        throw new Error('Larp Autopot modules did not load in the expected order');
    }

    namespace.core.start(namespace.ui.build);
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});

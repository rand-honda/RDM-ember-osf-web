import { setupTest } from 'ember-qunit';
import { module, test } from 'qunit';

module('Unit | Transform | embed', hooks => {
    setupTest(hooks);

    // Replace this with your real tests.
    test('it exists', function(assert) {
        const transform = this.owner.lookup('transform:embed');
        assert.ok(transform);
    });
});

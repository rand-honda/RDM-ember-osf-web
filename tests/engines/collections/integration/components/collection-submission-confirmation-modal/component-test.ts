import { click, render } from '@ember/test-helpers';
import { t } from 'ember-i18n/test-support';
import { setupEngineRenderingTest } from 'ember-osf-web/tests/helpers/engines';
import hbs from 'htmlbars-inline-precompile';
import { module, test } from 'qunit';

module('Integration | Component | collection-submission-confirmation-modal', hooks => {
    setupEngineRenderingTest(hooks, 'collections');

    test('it renders', async function(assert) {
        this.set('noop', () => { /* noop */ });
        await render(hbs`
        {{collection-submission-confirmation-modal
            openModal=true addToCollection=(action this.noop)
            cancel=(action this.noop)
        }}`);
        assert.dom('.modal-header h3').hasText(
            t('collections.collection_submission_confirmation_modal.header').toString(),
        );
        assert.dom('.modal-body p').hasText(
            t('collections.collection_submission_confirmation_modal.body').toString(),
        );
        assert.dom('.modal-footer .btn-default ').hasText(
            t('general.cancel').toString(),
        );
        assert.dom('.modal-footer .btn-success ').hasText(
            t('collections.collection_submission_confirmation_modal.add_button').toString(),
        );
    });

    test('Add to collection button calls addToCollection action', async function(assert) {
        assert.expect(1);
        this.set('noop', () => { /* noop */ });
        this.set('externalSaveAction', () => {
            assert.ok(true);
        });
        await render(hbs`
        {{collection-submission-confirmation-modal
            openModal=true
            addToCollection=(action this.externalSaveAction)
            cancel=(action this.noop)
        }}`);
        await click('.btn-success');
    });

    test('Cancel button calls cancel action', async function(assert) {
        assert.expect(1);
        this.set('noop', () => { /* noop */ });
        this.set('externalCancelAction', () => {
            assert.ok(true);
        });
        await render(hbs`
        {{collection-submission-confirmation-modal
            openModal=true
            addToCollection=(action this.noop)
            cancel=(action this.externalCancelAction)
        }}`);
        await click('.btn-default');
    });
});

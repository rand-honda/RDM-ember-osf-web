import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import DS from 'ember-data';
import Intl from 'ember-intl/services/intl';
import { layout } from 'ember-osf-web/decorators/component';
import DraftRegistration from 'ember-osf-web/models/draft-registration';
import Toast from 'ember-toastr/services/toast';
import template from './template';

@tagName('')
@layout(template)
export default class RightNav extends Component {
    @service store!: DS.Store;
    draftRegistrations: DraftRegistration[] = [];
    @service toast!: Toast;

    @service router!: any;
    disableButtons: boolean = false;
    @service intl!: Intl;

    constructor(...args: any[]) {
        super(...args);
        this.handleRouteChange();
        this.router.on('routeDidChange', this.handleRouteChange);
    }

    willDestroy() {
        super.willDestroy();
        this.router.off('routeDidChange', this.handleRouteChange);
    }

    @action
    async handleRouteChange() {
        const currentUrl = window.location.href;
        const urlParts = currentUrl.split('/');
        const lastPartWithQuery = urlParts[urlParts.length - 1];
        const metadataTitle = lastPartWithQuery.split('?')[0];
        const cleanedTitle = metadataTitle.replace(/^\d+-/, '');
        const title = decodeURIComponent(cleanedTitle.replace(/-/g, ' '));
        const allSchemas = await this.store.findAll('registration-schema');

        const matchedSchema = allSchemas.find(
            (schema: any) => schema.schema.pages.some(
                (page: any) => page.title.trim().toLowerCase() === title.trim().toLowerCase()
                    && page.clipboardCopyPaste === false,
            ),
        );

        if (!this.isDestroyed && !this.isDestroying) {
            this.set('disableButtons', !!matchedSchema);
        }
    }

    @action
    async pasteFromClipboard() {
        try {
            const clipboardText = await navigator.clipboard.readText();
            try {
                const parsedJson = JSON.parse(clipboardText);
                const structuredJson: {[key: string]: any } = {};
                Object.entries(parsedJson).forEach(([key, value]) => {
                    structuredJson[key] = {
                        extra: [],
                        value,
                        comments: [],
                    };
                });

                const currentUrl = window.location.href;
                const idRegex = /\/drafts\/([a-f0-9]{24})/;
                const match = currentUrl.match(idRegex);
                if (match && match[1]) {
                    try {
                        const draftId = match[1];
                        const draftRegistration = await this.store.findRecord('draft-registration', draftId);
                        draftRegistration.set('registrationMetadata', structuredJson);
                        await draftRegistration.save();
                        window.location.reload();
                        this.toast.success(this.intl.t('registries.drafts.draft.form.clipboard_pasted'));
                    } catch (error) {
                        this.toast.success(this.intl.t('registries.drafts.draft.form.json_invalid'), error);
                    }
                }
            } catch (error) {
                this.toast.success(this.intl.t('registries.drafts.draft.form.clipboard_unread'), error);
            }
        } catch (error) {
            this.toast.error('Failed to read from clipboard: ', error);
        }
    }
}

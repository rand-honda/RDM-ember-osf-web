import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { action } from '@ember/object';
import { and, or } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import Media from 'ember-responsive';

import DS from 'ember-data';
import Intl from 'ember-intl/services/intl';
import { layout } from 'ember-osf-web/decorators/component';
import DraftRegistration from 'ember-osf-web/models/draft-registration';
import CurrentUser from 'ember-osf-web/services/current-user';
import Toast from 'ember-toastr/services/toast';

import styles from './styles';
import template from './template';

@tagName('')
@layout(template, styles)
export default class RegistriesSideNav extends Component {
    @service store!: DS.Store;
    draftRegistrations: DraftRegistration[] = [];
    // registrationSchema: RegistrationSchema[] = [];
    @service toast!: Toast;
    format?: string = '';

    @service media!: Media;
    @service intl!: Intl;
    @service currentUser!: CurrentUser;
    // changeset!: ChangesetDef;

    // Optional params
    onLinkClicked?: () => void;

    // Private properties
    shouldCollapse: boolean = false;

    @or('media.{isDesktop,isJumbo}')
    isCollapseAllowed!: boolean;

    @and('isCollapseAllowed', 'shouldCollapse')
    isCollapsed!: boolean;

    @service router!: any;
    disableButtons = false;
    pageTitle = '';
    jsonData = '';

    constructor(...args: any[]) {
        super(...args);
        this.handleRouteChange();
        if (this.router && typeof this.router.on === 'function') {
            this.router.on('routeDidChange', this.handleRouteChange.bind(this));
        }
    }

    @action
    toggle() {
        this.toggleProperty('shouldCollapse');
    }

    @action
    async handleRouteChange() {
        const currentUrl = window.location.href;
        const urlParts = currentUrl.split('/');
        const lastPartWithQuery = urlParts[urlParts.length - 1];
        const metadataTitle = lastPartWithQuery.split('?')[0];
        const cleanedTitle = metadataTitle.replace(/^\d+-/, '');
        const title = decodeURIComponent(cleanedTitle.replace(/-/g, ' '));
        this.set('pageTitle', title.trim().toLowerCase());
        const allSchemas = await this.store.findAll('registration-schema');
        const matchedSchema = allSchemas.find((schema: any) => schema.schema.pages.some((page: any) => (
            page.title.trim().toLowerCase() === title.trim().toLowerCase()
            && page.clipboardCopyPaste === false)));

        if (matchedSchema) {
            this.set('disableButtons', true);
        } else {
            this.set('disableButtons', false);
        }
    }

    @action
    async copyToClipboard() {
        const currentUrl = window.location.href;
        const idRegex = /\/drafts\/([a-f0-9]{24})/;
        const match = currentUrl.match(idRegex);
        if (match && match[1]) {
            const draftId = match[1];

            const draftRegistration = await this.store.findRecord('draft-registration', draftId);

            if (draftRegistration) {
                const registrationMetadata = await draftRegistration.registrationMetadata;
                const metadata: { [key: string]: any } = {};
                const registrationSchema = await draftRegistration.registrationSchema;
                for (const page of registrationSchema.schema.pages) {
                    if (page.title.trim().toLowerCase() !== this.pageTitle && !page.clipboardCopyPaste) {
                        continue;
                    }

                    for (const question of page.questions) {
                        Object.keys(registrationMetadata).forEach(key => {
                            if (key === question.qid && !key.startsWith('grdm-')) {
                                if (question.format === 'multiselect' && registrationMetadata[key].value === '') {
                                    metadata[key] = [];
                                } else {
                                    metadata[key] = registrationMetadata[key].value;
                                }
                            }
                        });
                    }
                }
                this.jsonData = JSON.stringify(metadata);
                if (this.jsonData === '{}' || Object.keys(JSON.parse(this.jsonData)).length === 0) {
                    this.toast.warning(this.intl.t('registries.drafts.draft.form.warning_noautosave'));
                } else {
                    await navigator.clipboard.writeText(this.jsonData);
                    this.toast.success(this.intl.t('registries.drafts.draft.form.clipboard_copied'));
                }
            }
        }
    }
}

import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { computed } from '@ember/object';
import { underscore } from '@ember/string';

import { layout } from 'ember-osf-web/decorators/component';
import { DraftMetadataProperties } from 'ember-osf-web/models/draft-registration';
import { PageManager, SchemaBlock } from 'ember-osf-web/packages/registration-schema';

import styles from './styles';
import template from './template';

@layout(template, styles)
@tagName('')
export default class RegistrationFormNavigationDropdown extends Component {
    // Required parameters
    schemaBlocks!: SchemaBlock[];

    // Optional paramaters
    showMetadata: boolean = false;
    pageManagers: PageManager[] = [];

    // Private properties
    metadataFields: string[] = Object.values(DraftMetadataProperties)
        .filter(prop => prop !== DraftMetadataProperties.NodeLicenseProperty)
        .map(underscore);

    @computed('schemaBlocks', 'pageManagers')
    get blocksWithAnchor() {
        const grdmFilePage = this.pageManagers.find(page => page.pageHeadingText === '登録データ');
        const ignoreGroupKeys = grdmFilePage && grdmFilePage.schemaBlockGroups
            ? grdmFilePage.schemaBlockGroups
                .filter(group => group.registrationResponseKey
                    && group.registrationResponseKey.startsWith('__responseKey_grdm-file:'))
                .map(group => group.schemaBlockGroupKey)
            : [];
        return this.schemaBlocks.filter(({ blockType, displayText, schemaBlockGroupKey }) => (
            blockType === 'page-heading'
                || blockType === 'section-heading'
                || blockType === 'subsection-heading'
                || blockType === 'question-label'
        ) && displayText && !ignoreGroupKeys.includes(schemaBlockGroupKey));
    }
}

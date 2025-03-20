import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';

import { action, computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { ChangesetDef } from 'ember-changeset/types';
import { layout } from 'ember-osf-web/decorators/component';
import MetadataNodeEradModel from 'ember-osf-web/models/metadata-node-erad';
import { SchemaBlockGroup } from 'ember-osf-web/packages/registration-schema';
import { PageManager } from 'ember-osf-web/packages/registration-schema/page-manager';
import DraftRegistrationManager from 'registries/drafts/draft/draft-registration-manager';
import styles from './styles';
import template from './template';

@layout(template, styles)
@tagName('')
export default class JapanGrantNumberInput extends Component {
    // Required param
    metadataNodeErad!: MetadataNodeEradModel;
    changeset!: ChangesetDef;
    metadataChangeset!: ChangesetDef;
    @alias('draftManager.pageManagers')
    pageManagers!: PageManager[];
    draftManager!: DraftRegistrationManager;

    @alias('schemaBlock.registrationResponseKey')
    valuePath!: string;
    onInput!: () => void;
    onMetadataInput!: () => void;

    anotherOption?: string;

    didReceiveAttrs() {
        const current = this.changeset.get(this.valuePath);
        if (this.metadataNodeErad.records.every(rc => rc.kadai_id !== current)) {
            this.anotherOption = current;
        }
    }

    @computed('anotherOption')
    get options(): string[] {
        const options = this.metadataNodeErad.records.map(rc => this.getLocalizedItemText(rc));
        if (this.anotherOption) {
            options.push(this.anotherOption);
        }
        return options;
    }

    @action
    onChange(option: string) {
        const eradRecord = this.metadataNodeErad.records
            .find(rc => this.getLocalizedItemText(rc) === option);
        let kadaiId;
        if (eradRecord) {
            kadaiId = eradRecord.japan_grant_number;
            this.updateCode('e-rad-award-funder-input', eradRecord.haibunkikan_cd);
            this.updateCode('single-select-pulldown-input', eradRecord.haibunkikan_cd);
            this.updateCode('e-rad-award-field-input', eradRecord.bunya_cd);
            if (eradRecord.funding_stream_code) {
                const key = this.getResponseKeyByBlockType('funding-stream-code-input');
                if (key) {
                    this.changeset.set(key, eradRecord.funding_stream_code);
                }
            }
            if (eradRecord.program_name_ja) {
                const key = this.getResponseKeyByBlockType('jgn-program-name-ja-input');
                if (key) {
                    this.changeset.set(key, eradRecord.program_name_ja);
                }
            }
            if (eradRecord.program_name_en) {
                const key = this.getResponseKeyByBlockType('jgn-program-name-en-input');
                if (key) {
                    this.changeset.set(key, eradRecord.program_name_en);
                }
            }
            this.changeset.set(
                this.draftManager.getResponseKeyByBlockType('e-rad-award-title-ja-input'),
                this.getLocalizedTextFrom(eradRecord.kadai_mei, 0),
            );
            this.changeset.set(
                this.draftManager.getResponseKeyByBlockType('e-rad-award-title-en-input'),
                this.getLocalizedTextFrom(eradRecord.kadai_mei, 1),
            );
            this.metadataChangeset.set(
                'title',
                `${this.getLocalizedTextFrom(eradRecord.kadai_mei, 0)}`,
            );
        } else {
            kadaiId = option;
        }
        this.changeset.set(this.valuePath, kadaiId);
        this.onMetadataInput();
        this.onInput();
    }

    getLocalizedTextFrom(text: string, index: number) {
        const pos = text.lastIndexOf('|');
        if (pos === -1) {
            if (index === 1) {
                return '';
            }
            return text;
        }
        if (index === 0) {
            return text.substring(0, pos);
        }
        if (index === 1) {
            return text.substring(pos + 1);
        }
        throw new Error(`Invalid index: ${index}`);
    }

    getResponseKeyByBlockType(name: string) {
        try {
            return this.draftManager.getResponseKeyByBlockType(name);
        } catch (_) {
            return null;
        }
    }

    @action
    onInputSearch(text: string) {
        if (this.metadataNodeErad.records.every(rc => rc.kadai_id !== text) && this.anotherOption !== text) {
            this.set('anotherOption', text);
        }
        return true;
    }

    updateCode(blockType: string, code: string) {
        const key = this.draftManager.getResponseKeyByBlockType(blockType);
        const blocks = this.draftManager.schemaBlocks
            .filter(item => item.registrationResponseKey === key);
        if (blocks.length === 0) {
            return;
        }
        const block = blocks[0];
        const schemaBlockGroups: SchemaBlockGroup[] = this.pageManagers
            .filter(item => item.schemaBlockGroups !== undefined)
            .map(item => item.schemaBlockGroups as SchemaBlockGroup)
            .reduce((x, y) => x.concat(y), [] as SchemaBlockGroup[]);
        const groups = schemaBlockGroups
            .filter(item => item.schemaBlockGroupKey === block.schemaBlockGroupKey);
        if (groups.length === 0) {
            return;
        }
        const group = groups[0];
        if (!group.optionBlocks) {
            return;
        }
        const options = group.optionBlocks.filter(item => this.getCode(item.helpText) === code);
        if (options.length === 0) {
            return;
        }
        this.changeset.set(key, options[0].displayText);
    }

    getCode(text: string | undefined): string | undefined {
        if (text === undefined) {
            return undefined;
        }
        if (!text.includes('|')) {
            return text;
        }
        const texts = text.split('|');
        if (texts.length < 3) {
            return text;
        }
        return texts[2];
    }

    getLocalizedItemText(eradRecord: any) {
        return `${eradRecord.kadai_id} (${eradRecord.japan_grant_number}) | ${eradRecord.kadai_mei}`
            + ` - ${eradRecord.haibunkikan_mei} | ${eradRecord.haibunkikan_cd}`
            + ` - ${eradRecord.bunya_mei} | ${eradRecord.bunya_cd}`
            + ` (${eradRecord.nendo})`;
    }
}

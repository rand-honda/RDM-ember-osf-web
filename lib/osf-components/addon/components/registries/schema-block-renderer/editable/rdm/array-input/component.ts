import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';

import { assert } from '@ember/debug';
import { action } from '@ember/object';
import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';

import Changeset from 'ember-changeset';
import lookupValidator from 'ember-changeset-validations';
import { ChangesetDef } from 'ember-changeset/types';
import Intl from 'ember-intl/services/intl';
import { layout } from 'ember-osf-web/decorators/component';
import NodeModel from 'ember-osf-web/models/node';
import { buildValidation, SchemaBlock, SchemaBlockGroup } from 'ember-osf-web/packages/registration-schema';
import DraftRegistrationManager from 'registries/drafts/draft/draft-registration-manager';

import styles from './styles';
import template from './template';

@layout(template, styles)
@tagName('')
export default class ArrayInput extends Component {
    // Required param
    changeset!: ChangesetDef;
    metadataChangeset!: ChangesetDef;
    draftManager!: DraftRegistrationManager;
    @service intl!: Intl;

    @alias('schemaBlock.registrationResponseKey')
    valuePath!: string;
    onInput!: () => void;
    onMetadataInput!: () => void;
    schemaBlockGroup!: SchemaBlockGroup;
    schemaBlock!: SchemaBlock;
    node!: NodeModel;

    subChangesets: ChangesetDef[] = [];

    didReceiveAttrs() {
        const rowAdditionCaption = this.schemaBlock.rowAdditionCaption || '';

        this.schemaBlock.rowAdditionCaption = this.getLocalizedText(rowAdditionCaption);

        const raw = this.changeset.get(this.valuePath);
        if (raw) {
            const prefix = `${this.valuePath}|`;
            const values = JSON.parse(raw);
            const subChangesets: ChangesetDef[] = values.map((row: Array<{key: string, value: any}>) => {
                const subChangeset = this.createSubChangeset();
                Object.entries(row).forEach(([k, v]) => {
                    const key2 = `${prefix}${k}`;
                    subChangeset.set(key2, v);
                });
                subChangeset.on('afterValidation', () => {
                    this.save(this.get('subChangesets'));
                });
                return subChangeset;
            });
            this.set('subChangesets', subChangesets);
        } else {
            this.set('subChangesets', []);
        }
    }

    save(subChangesets: ChangesetDef[]) {
        const prefix = `${this.valuePath}|`;
        const allChanges = subChangesets.map(changeset => {
            const changes: Array<{key: string, value: any}> = changeset.changes as any;
            const row: {[key: string]: any} = {};
            changes.forEach(({ key, value }) => {
                assert(
                    `Sub changeset key ${key} requires starting with parent key ${prefix}`,
                    key.startsWith(prefix),
                );
                const key2 = key.substr(prefix.length);
                row[key2] = value;
            });
            return row;
        }).filter(changes => Object.keys(changes).length);
        // todo: exclude rows where all values are empty
        this.changeset.set(this.valuePath, JSON.stringify(allChanges));
    }

    createSubChangeset() {
        const validations = buildValidation(this.schemaBlockGroup.children!, this.node);
        const subChangeset = new Changeset(
            {},
            lookupValidator(validations),
            validations,
        ) as ChangesetDef;
        // todo: setupEventForSyncValidation
        return subChangeset;
    }

    @action
    onAdd() {
        const subChangeset = this.createSubChangeset();
        this.set('subChangesets', [...this.get('subChangesets'), subChangeset]);
        subChangeset.on('afterValidation', () => {
            this.save(this.get('subChangesets'));
        });
    }

    @action
    onRemove(subChangeset: ChangesetDef) {
        const newSubChangesets = this.get('subChangesets').filter(c => c !== subChangeset);
        this.set('subChangesets', newSubChangesets);
        this.save(newSubChangesets);
    }

    getLocalizedText(text: string) {
        if (!text.includes('|')) {
            return text;
        }
        const texts = text.split('|');
        if (this.intl.locale.includes('ja')) {
            return texts[0];
        }
        return texts[1];
    }
}

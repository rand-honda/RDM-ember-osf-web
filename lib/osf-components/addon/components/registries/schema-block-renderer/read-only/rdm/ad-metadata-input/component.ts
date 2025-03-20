import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { assert } from '@ember/debug';

import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import { ChangesetDef } from 'ember-changeset/types';
import Intl from 'ember-intl/services/intl';
import { layout } from 'ember-osf-web/decorators/component';
import NodeModel from 'ember-osf-web/models/node';
import styles from './styles';
import template from './template';

interface FileMetadataEntity {
    comments?: any[];
    extra?: any[];
    value: any;
}

interface FileMetadata {
    path: string;
    urlpath: string | null;
    metadata: {
        [key: string]: FileMetadataEntity,
    };
}

interface FileEntry {
    path: string;
}

@layout(template, styles)
@tagName('')
export default class AdMetadataInput extends Component {
    @service intl!: Intl;

    // Required param
    changeset!: ChangesetDef;
    node!: NodeModel;

    @alias('schemaBlock.registrationResponseKey')
    valuePath!: string;
    onInput!: () => void;

    didReceiveAttrs() {
        assert(
            'Registries::SchemaBlockRenderer::Editable::Rdm::AdMetadataInput requires a changeset to render',
            Boolean(this.changeset),
        );
        assert(
            'Registries::SchemaBlockRenderer::Editable::Rdm::AdMetadataInput requires a node to render',
            Boolean(this.node),
        );
        assert(
            'Registries::SchemaBlockRenderer::Editable::Rdm::AdMetadataInput requires a valuePath to render',
            Boolean(this.valuePath),
        );
    }

    @computed('changeset', 'valuePath')
    get adMetadatas(): FileMetadata[] {
        if (!this.changeset) {
            return [];
        }
        const value = this.changeset.get(this.valuePath);
        if (!value) {
            return [];
        }
        return JSON.parse(value) as FileMetadata[];
    }

    @computed('adMetadatas')
    get fileEntries(): FileEntry[] {
        return this.get('adMetadatas').map(metadata => ({
            path: metadata.path,
        }) as FileEntry);
    }
}

import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { assert } from '@ember/debug';

import { action, computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import { ChangesetDef } from 'ember-changeset/types';
import config from 'ember-get-config';
import Intl from 'ember-intl/services/intl';
import { layout, requiredAction} from 'ember-osf-web/decorators/component';
import NodeModel from 'ember-osf-web/models/node';
import pathJoin from 'ember-osf-web/utils/path-join';

import MetadataNodeProjectModel from 'ember-osf-web/models/metadata-node-project';
import DraftRegistrationManager from 'registries/drafts/draft/draft-registration-manager';
import styles from './styles';
import template from './template';
import File from 'ember-osf-web/models/file';
import DS from 'ember-data';
import { task } from 'ember-concurrency-decorators';
import FileProvider from 'ember-osf-web/models/file-provider';

const { OSF: { url: baseURL } } = config;

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
    parts: string[];
    lastPart: string;
    lastPartDepth: number;
    folder: boolean;
    title: string | null;
    url: string | null;
    fileUrl: string | null;
    manager: string | null;
    metadata: FileMetadata | null;
    added: boolean;
    style: string;
    visible: boolean;
    folderExpanded: boolean;
}

@layout(template, styles)
@tagName('')
export default class AdMetadataInput extends Component {
    @service intl!: Intl;

    // Required param
    changeset!: ChangesetDef;
    node!: NodeModel;
    metadataNodeProject!: MetadataNodeProjectModel;
    draftManager!: DraftRegistrationManager;

    @alias('schemaBlock.registrationResponseKey')
    valuePath!: string;
    onInput!: () => void;

    @alias('schemaBlock.schema.id')
    schemaId!: any;

    folderExpands: {[key: string]: boolean} = {};

    item: File[] = [];
    @service store!: DS.Store;
    currentFolder!: File;

    fileProvider!: FileProvider;
    @requiredAction openFile!: (file: File, show: string) => void;

    async didInsertElement(){
        super.didInsertElement();
        const fileProviders = await this.node.files;
        const fileProvider = fileProviders.findBy('name', 'osfstorage') as FileProvider;
        const rootFolder = await fileProvider.rootFolder;
        this.getCurrentFolderItems.perform(rootFolder);
    }

    @task
    getCurrentFolderItems = task(function *(this: AdMetadataInput, targetFolder: File) {
        this.set('currentFolder', targetFolder);
        const folderItems = yield this.currentFolder.files;
        const itemsArray = folderItems.toArray();
        this.set('item', this.item.concat(itemsArray));

        const paths = this.get('projectFilePaths');
        const folderExpands = this.get('folderExpands');
        if (!Object.values(folderExpands).length) {
            paths.forEach(path => {
                if (path.endsWith('/') && path.split('/').length === 2) {
                    folderExpands[path] = true;
                }
            });
            this.set('folderExpands', folderExpands);
        }

        for (const item of itemsArray) {
            if(item.materializedPath.match(/.+\/$/)){
                yield this.getCurrentFolderItems.perform(item);
            }
        }
    });

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

    @computed('node')
    get nodeUrl() {
        return this.node && pathJoin(baseURL, this.node.id);
    }

    @computed('changeset', 'valuePath')
    get adMetadatas(): FileMetadata[] {
        const value = this.changeset.get(this.valuePath);
        if (!value) {
            return [];
        }
        const metadatas: FileMetadata[] = JSON.parse(value);
        metadatas.sort((a, b) => a.path.localeCompare(b.path));
        return metadatas;
    }

    @computed('item')
    get projectFileMetadata(): FileMetadata[] {
        const res: FileMetadata[] = [];    
        this.get('item').forEach(item => {
            res.push({
                path: item.provider+item.materializedPath,
                urlpath: '',
                metadata: {},
            });
        })
        return res;
    }


    @computed('projectFileMetadata')
    get projectFilePaths(): string[] {
        const projectFileMetadatas = this.get('projectFileMetadata');
        const pathSet = new Set();
        projectFileMetadatas.forEach(projectFileMetadata => {
            let path = '';
            const parts = projectFileMetadata.path.split('/');
            parts.forEach((part, i) => {
                if (!part.length) {
                    return;
                }
                path += part;
                if (i + 1 < parts.length) {
                    path += '/';
                }
                pathSet.add(path);
            });
        });
        return Array.from(pathSet).sort((a, b) => a.localeCompare(b));
    }

    @computed('adMetadatas', 'projectFileMetadata', 'projectFilePaths', 'folderExpands')
    get fileEntries(): FileEntry[] {
        const metadataMap: {[key: string]: FileMetadata} = {};
        this.get('adMetadatas').forEach(metadata => {
            metadataMap[metadata.path] = metadata;
        });
        const projectFileMetadataMap: {[key: string]: FileMetadata} = {};
       
        this.get('projectFileMetadata').forEach(projectFileMetadata => {
            projectFileMetadataMap[projectFileMetadata.path] = projectFileMetadata;
        });

        const paths = this.get('projectFilePaths');
        const folderExpands = this.get('folderExpands');
        const res = paths.map(path => {
            const metadata = metadataMap[path] || projectFileMetadataMap[path];
            const parts = path.split('/');
            if (!parts[parts.length - 1].length) {
                parts.pop();
            }
            const folder = path.match(/.+\/$/) !== null;
            // 18
            return {
                path,
                parts,
                lastPart: parts[parts.length - 1],
                lastPartDepth: parts.length,
                folder,
                title: metadata ? this.extractTitleFromMetadata(metadata) : null,
                manager: metadata ? this.extractManagerFromMetadata(metadata) : null,
                url: metadata ? this.extractUrlFromMetadata(metadata) : null,
                fileUrl: metadata && metadata.urlpath ? `${pathJoin(baseURL, metadata.urlpath)}#edit-metadata` : null,
                metadata,
                added: metadataMap[path] != null,
                hasProject: projectFileMetadataMap[path] != null,
                style: `margin: 0 0 0 ${parts.length * 16 + (folder ? 0 : 18)}px`,
                visible: [...parts.slice(0, parts.length - 1).keys()]
                    .every(i => folderExpands[`${parts.slice(0, i + 1).join('/')}/`]),
                folderExpanded: folderExpands[path],
            } as FileEntry;
        });
        return res;
    }

    saveFileMetadatas(metadatas: FileMetadata[]) {       
        metadatas.sort((a, b) => a.path.localeCompare(b.path));
        this.changeset.set(
            this.valuePath,
            metadatas.length ? JSON.stringify(metadatas) : null,
        );
        this.onInput();
        this.notifyPropertyChange('adMetadatas');
    }

    @action
    addFileMetadata(this: AdMetadataInput, entry: FileEntry) {
        const metadatas = this.get('adMetadatas');
        if (entry.metadata) {
            metadatas.push(entry.metadata);
        }
        this.saveFileMetadatas(metadatas);
    }

    @action
    removeFileMetadata(this: AdMetadataInput, entry: FileEntry) {
        const metadatas = this.get('adMetadatas');
        const metadata = metadatas.find(m => m.path === entry.path);
        if (metadata) {
            metadatas.splice(metadatas.indexOf(metadata), 1);
        }
        this.saveFileMetadatas(metadatas);
    }

    extractTitleFromMetadata(metadata: FileMetadata): string | null {
        const titleJa = metadata.metadata['grdm-file:title-ja'];
        const titleEn = metadata.metadata['grdm-file:title-en'];
        if (!titleJa && !titleEn) {
            return null;
        }
        if (titleJa && !titleEn) {
            return `${titleJa.value}`;
        }
        if (!titleJa && titleEn) {
            return `${titleEn.value}`;
        }
        if (!titleJa.value && !titleEn.value) {
            return null;
        }
        if (this.intl.locale.includes('ja')) {
            return `${titleJa.value}`;
        }
        return `${titleEn.value}`;
    }

    extractManagerFromMetadata(metadata: FileMetadata): string | null {
        const managerJa = metadata.metadata['grdm-file:data-man-name-ja'];
        const managerEn = metadata.metadata['grdm-file:data-man-name-en'];
        if (!managerJa && !managerEn) {
            return null;
        }
        let value;
        if (managerJa && !managerEn) {
            value = managerJa.value;
        } else if (!managerJa && managerEn) {
            value = managerEn.value;
        } else if (this.intl.locale.includes('ja')) {
            value = managerJa.value;
        } else {
            value = managerEn.value;
        }
        if (value && typeof value === 'object') {
            return (
                this.intl.locale.includes('ja')
                    ? [value.last, value.middle, value.first]
                    : [value.first, value.middle, value.last]
            ).filter(v => v).join(' ');
        }
        return value;
    }

    extractUrlFromMetadata(metadata: FileMetadata): string | null {
        const url = metadata.metadata['grdm-file:repo-url-doi-link'];
        if (!url) {
            return null;
        }
        return `${url.value}`;
    }


    @action
    expandFolder(this: AdMetadataInput, entry: FileEntry, expand: boolean) {
        const folderExpands = this.get('folderExpands');
        folderExpands[entry.path] = expand;       
        this.set('folderExpands', folderExpands);
        this.notifyPropertyChange('folderExpands');
    }
}
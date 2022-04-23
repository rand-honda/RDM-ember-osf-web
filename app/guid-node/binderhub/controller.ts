import Controller from '@ember/controller';
import EmberError from '@ember/error';
import { action, computed } from '@ember/object';
import { reads } from '@ember/object/computed';
import { later } from '@ember/runloop';
import { inject as service } from '@ember/service';

import DS from 'ember-data';

import Intl from 'ember-intl/services/intl';
import { BuildFormValues } from 'ember-osf-web/guid-node/binderhub/-components/external-repository/component';
import { getContext } from 'ember-osf-web/guid-node/binderhub/-components/jupyter-servers-list/component';
import BinderHubConfigModel from 'ember-osf-web/models/binderhub-config';
import FileModel from 'ember-osf-web/models/file';
import FileProviderModel from 'ember-osf-web/models/file-provider';
import Node from 'ember-osf-web/models/node';
import Analytics from 'ember-osf-web/services/analytics';
import CurrentUser from 'ember-osf-web/services/current-user';
import StatusMessages from 'ember-osf-web/services/status-messages';
import { addPathSegment } from 'ember-osf-web/utils/url-parts';
import Toast from 'ember-toastr/services/toast';

/* eslint-disable camelcase */
export interface BuildMessage {
    phase: string;
    message: string;
    authorization_url?: string;
    url?: string;
    token?: string;
}
/* eslint-enable camelcase */

export interface BootstrapPath {
    path: string;
    pathType: string;
}

export default class GuidNodeBinderHub extends Controller {
    queryParams = ['bh', 'jh'];

    @service toast!: Toast;
    @service intl!: Intl;
    @service statusMessages!: StatusMessages;
    @service analytics!: Analytics;
    @service currentUser!: CurrentUser;

    tab?: string;

    @reads('model.taskInstance.value')
    node?: Node;

    isPageDirty = false;

    configCache?: DS.PromiseObject<BinderHubConfigModel>;

    buildLog: BuildMessage[] | null = null;

    externalRepoBuildFormValues: BuildFormValues | null = null;

    jupyterHubAPIError = false;

    binderHubBuildError = false;

    buildPhase: string | null = null;

    bh: string | null = null;

    jh: string | null = null;

    @computed('config.isFulfilled')
    get loading(): boolean {
        return !this.config || !this.config.get('isFulfilled');
    }

    @computed('tab')
    get activeTab() {
        return this.tab ? this.tab : 'editproject';
    }

    @action
    changeTab(activeId: string) {
        this.set('tab', activeId === 'editproject' ? undefined : activeId);
        this.analytics.click('tab', `BinderHub tab - Change tab to: ${activeId}`);
    }

    @action
    renewBinderHubToken(this: GuidNodeBinderHub, binderhubUrl: string) {
        if (!this.config) {
            throw new EmberError('Illegal config');
        }
        const config = this.config.content as BinderHubConfigModel;
        const binderhub = config.findBinderHubByURL(binderhubUrl);
        if (!binderhub) {
            throw new EmberError('Illegal config');
        }
        if (!binderhub.authorize_url) {
            throw new EmberError('Illegal config');
        }
        window.location.href = this.getURLWithContext(binderhub.authorize_url);
    }

    @action
    renewJupyterHubToken(this: GuidNodeBinderHub, jupyterhubUrl: string) {
        if (!this.config) {
            throw new EmberError('Illegal config');
        }
        const config = this.config.content as BinderHubConfigModel;
        const jupyterhub = config.findJupyterHubByURL(jupyterhubUrl);
        if (jupyterhub) {
            if (!jupyterhub.authorize_url) {
                throw new EmberError('Illegal config');
            }
            window.location.href = this.getURLWithContext(jupyterhub.authorize_url);
            return;
        }
        // Maybe BinderHub not authorized
        const binderhubCand = config.findBinderHubCandidateByJupyterHubURL(jupyterhubUrl);
        if (!binderhubCand) {
            throw new EmberError('Illegal config');
        }
        this.renewBinderHubToken(binderhubCand.binderhub_url);
    }

    @computed('node.files.[]')
    get defaultStorageProvider(): FileProviderModel | null {
        if (!this.node) {
            return null;
        }
        const providers = this.node.get('files').filter(f => f.name === 'osfstorage');
        if (providers.length === 0) {
            return null;
        }
        return providers[0];
    }

    @computed('defaultStorageProvider.rootFolder.files.[]')
    get defaultStorage(): FileModel | null {
        const provider = this.get('defaultStorageProvider');
        if (!provider) {
            return null;
        }
        return provider.get('rootFolder');
    }

    async generatePersonalToken() {
        const scopeIds = ['osf.full_read', 'osf.full_write'];
        const scopes = await Promise.all(scopeIds.map(scopeId => this.store.findRecord('scope', scopeId)));
        const token = await this.store.createRecord('token', {
            name: `BinderHub addon ${new Date().toISOString()}`,
            scopes,
        });
        await token.save();
        return token;
    }

    async performBuild(
        binderhubUrl: string,
        needsPersonalToken: boolean,
        path: BootstrapPath | null,
        callback: (result: BuildMessage) => void,
    ) {
        if (!this.config) {
            throw new EmberError('Illegal config');
        }
        const { buildFormValues } = this;
        if (!buildFormValues) {
            throw new EmberError('Illegal state');
        }
        const buildPath = this.getBinderPath(buildFormValues, path);
        if (!buildPath) {
            throw new EmberError('Illegal state');
        }
        const config = this.config.content as BinderHubConfigModel;
        const binderhub = config.findBinderHubByURL(binderhubUrl);
        let additional = '';
        if (this.currentUser && this.currentUser.currentUserId) {
            additional += `&userctx=${this.currentUser.currentUserId}`;
        }
        additional += `&${this.getUserOptions()}`;
        if (binderhub && !binderhub.authorize_url) {
            const token = await this.generatePersonalToken();
            additional += `&repo_token=${token.tokenValue}`;
            const hubUrl = addPathSegment(binderhub.url, 'hub');
            const hubBuildUrl = addPathSegment(hubUrl, buildPath);
            const hubUrlSep = hubBuildUrl.includes('?') ? '&' : '?';
            const url = `${hubBuildUrl}${hubUrlSep}${additional.substring(1)}`;
            window.open(url, '_blank');
            return;
        }
        if (!binderhub || !binderhub.token) {
            throw new EmberError('Illegal config');
        }
        if (needsPersonalToken) {
            const token = await this.generatePersonalToken();
            additional += `&repo_token=${token.tokenValue}`;
        }
        const buildUrl = addPathSegment(binderhub.url, buildPath);
        const urlSep = buildUrl.includes('?') ? '&' : '?';
        const source = new EventSource(`${buildUrl}${urlSep}token=${binderhub.token.access_token}${additional}`);
        source.onmessage = (message: MessageEvent) => {
            const data = JSON.parse(message.data) as BuildMessage;
            if (data.phase === 'auth' && data.authorization_url && !needsPersonalToken) {
                source.close();
                later(async () => {
                    await this.performBuild(binderhubUrl, true, path, callback);
                }, 0);
                return;
            }
            this.handleBuildMessage(source, data, callback);
        };
        source.onerror = (_: any) => {
            this.set('binderHubBuildError', true);
        };
    }

    getUserOptions(): string {
        if (!this.node) {
            throw new EmberError('Illegal config');
        }
        if (!this.node.links.self) {
            throw new EmberError('Illegal config');
        }
        const nodeUrl = this.node.links.self.toString();
        let opts = `useropt.rdm_node=${encodeURIComponent(nodeUrl)}`;
        const matched = nodeUrl.match(/^(http.+\/v2\/)nodes\/([a-zA-Z0-9]+)\/.*$/);
        if (!matched) {
            throw new EmberError('Illegal config');
        }
        opts += `&useropt.rdm_api_url=${encodeURIComponent(matched[1])}`;
        opts += `&useropt.rdm_node_id=${encodeURIComponent(matched[2])}`;
        return opts;
    }

    get buildFormValues(): BuildFormValues | null {
        if (this.activeTab === 'externalrepo') {
            return this.externalRepoBuildFormValues;
        }
        if (!this.node) {
            throw new EmberError('Illegal config');
        }
        const nodeUrl = this.node.links.html as string;
        const storageUrl = addPathSegment(nodeUrl, 'osfstorage');
        const encodedNodeUrl = encodeURIComponent(storageUrl);
        return {
            providerPrefix: 'rdm',
            repo: encodedNodeUrl,
            ref: 'master',
        } as BuildFormValues;
    }

    getBinderPath(args: BuildFormValues, path: BootstrapPath | null) {
        // return a v2 url from a providerPrefix, repository, ref, and (file|url)path
        if (args.repo.length === 0) {
            // no repo, no url
            return null;
        }
        let url = `build/${args.providerPrefix}/${args.repo}/${args.ref}`;
        if (path && path.path && path.path.length > 0) {
            // encode the path, it will be decoded in loadingMain
            url = `${url}?${path.pathType}path=${encodeURIComponent(path.path)}`;
        }
        return url;
    }

    handleBuildMessage(source: EventSource, data: BuildMessage, callback: (result: BuildMessage) => void) {
        const logs: BuildMessage[] = (this.buildLog || []).map(elem => elem);
        logs.push(data);
        this.set('buildLog', logs);
        if (data.phase) {
            this.set('buildPhase', data.phase);
        }
        if (data.phase === 'ready' || data.phase === 'failed' || data.phase === 'failure') {
            source.close();
            if (!callback) {
                return;
            }
            callback(data);
        }
    }

    @computed('node')
    get config(): DS.PromiseObject<BinderHubConfigModel> | undefined {
        if (this.configCache) {
            return this.configCache;
        }
        if (!this.node) {
            return undefined;
        }
        this.configCache = this.store.findRecord('binderhub-config', this.node.id);
        return this.configCache!;
    }

    @action
    externalRepoChanged(this: GuidNodeBinderHub, buildFormValues: BuildFormValues) {
        this.externalRepoBuildFormValues = buildFormValues;
    }

    @action
    requestError(this: GuidNodeBinderHub, _: any) {
        this.set('jupyterHubAPIError', true);
    }

    @action
    projectError(this: GuidNodeBinderHub, exception: any, message: string) {
        if (!exception.message) {
            this.toast.error(message);
            return;
        }
        this.toast.error(`${message}: ${exception.message}`);
    }

    @action
    build(
        this: GuidNodeBinderHub, binderhubUrl: string,
        path: BootstrapPath | null, callback: (result: BuildMessage) => void,
    ) {
        this.set('buildLog', []);
        later(async () => {
            await this.performBuild(binderhubUrl, false, path, callback);
        }, 0);
    }

    getURLWithContext(url: string) {
        const bh = getContext('bh');
        const jh = getContext('jh');
        const ourl = new URL(url);
        const osearch = new URLSearchParams(ourl.search);
        if (bh) {
            osearch.set('bh', bh);
        }
        if (jh) {
            osearch.set('jh', jh);
        }
        ourl.search = `?${osearch.toString()}`;
        return ourl.href;
    }
}

declare module '@ember/controller' {
    interface Registry {
        'guid-node/binderhub': GuidNodeBinderHub;
    }
}

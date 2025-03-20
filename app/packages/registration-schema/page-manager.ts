import { assert } from '@ember/debug';
import { computed, set } from '@ember/object';
import Changeset from 'ember-changeset';
import lookupValidator from 'ember-changeset-validations';
import { ChangesetDef } from 'ember-changeset/types';
import NodeModel from 'ember-osf-web/models/node';
import {
    buildValidation,
    getSchemaBlockGroups,
    SchemaBlock,
    SchemaBlockGroup,
    setupEventForSyncValidation,
    setupEventForSyncValidation2,
} from 'ember-osf-web/packages/registration-schema';
import { RegistrationResponse } from 'ember-osf-web/packages/registration-schema/registration-response';

export class PageManager {
    changeset?: ChangesetDef;
    schemaBlockGroups?: SchemaBlockGroup[];
    pageHeadingText?: string;
    concealmentPageNavigator?: boolean;
    isVisited?: boolean;

    constructor(pageSchemaBlocks: SchemaBlock[], registrationResponses: RegistrationResponse, node?: NodeModel) {
        this.schemaBlockGroups = getSchemaBlockGroups(pageSchemaBlocks);
        if (this.schemaBlockGroups) {
            this.pageHeadingText = this.schemaBlockGroups[0].labelBlock!.displayText!;
            this.concealmentPageNavigator = this.schemaBlockGroups[0].labelBlock!.concealmentPageNavigator!;

            this.isVisited = this.schemaBlockGroups.some(
                ({ registrationResponseKey: key }) => Boolean(key && (key in registrationResponses)),
            );

            const validations = buildValidation(this.schemaBlockGroups, node);
            this.changeset = new Changeset(
                registrationResponses,
                lookupValidator(validations),
                validations,
            ) as ChangesetDef;

            setupEventForSyncValidation(this.changeset, this.schemaBlockGroups);

            setupEventForSyncValidation2(this.changeset, this.schemaBlockGroups);

            if (this.isVisited) {
                this.changeset.validate();
            }
        } else {
            assert('PageManager: schemaBlockGroups is not defined.');
        }
    }

    setChangesetValue(valuePath: string, value: any) {
        if (this.changeset) {
            this.changeset.set(valuePath, value);
            this.changeset.validate();
        }
    }

    @computed('changeset.isValid')
    get pageIsValid() {
        if (this.changeset) {
            return this.changeset.get('isValid');
        }
        return false;
    }

    @computed('changeset.isInvalid')
    get pageIsInvalid() {
        if (this.changeset) {
            return this.changeset.get('isInvalid');
        }
        return false;
    }

    setPageIsVisited() {
        set(this, 'isVisited', true);
    }

    getPageIsVisited() {
        return this.isVisited;
    }

    validatePage() {
        if (this.changeset) {
            this.changeset.validate();
        }
    }
}

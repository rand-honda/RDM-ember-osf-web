import { assert } from '@ember/debug';
import { set } from '@ember/object';
import { ValidationObject, ValidatorFunction } from 'ember-changeset-validations';
import { validateFormat, validatePresence } from 'ember-changeset-validations/validators';

import { ValidationResult } from 'ember-changeset-validations/utils/validation-errors';
import { ChangesetDef } from 'ember-changeset/types';
import DraftRegistration, { DraftMetadataProperties } from 'ember-osf-web/models/draft-registration';
import NodeModel, { NodeLicense } from 'ember-osf-web/models/node';
import { RegistrationResponse } from 'ember-osf-web/packages/registration-schema';
import { SchemaBlockGroup } from 'ember-osf-web/packages/registration-schema/schema-block-group';
import { validateFileList, validateRequiredIf } from 'ember-osf-web/validators/validate-response-format';

export const NodeLicenseFields: Record<keyof NodeLicense, string> = {
    copyrightHolders: 'Copyright Holders',
    year: 'Year',
};

function getErrorType(groupType?: string) {
    let validationErrorType = 'blank';
    switch (groupType) {
    case 'short-text-input':
        break;
    case 'long-text-input':
        break;
    case 'file-input':
        validationErrorType = 'mustSelectFileMinOne';
        break;
    case 'single-select-input':
        validationErrorType = 'mustSelect';
        break;
    case 'multi-select-input':
        validationErrorType = 'mustSelectMinOne';
        break;
    default:
        break;
    }
    return validationErrorType;
}

export function buildValidation(groups: SchemaBlockGroup[], node?: NodeModel) {
    const ret: ValidationObject<RegistrationResponse> = {};
    groups.forEach((group: SchemaBlockGroup) => {
        // ignore GRDM file specific fields
        if (group.registrationResponseKey
            && group.registrationResponseKey.match(/^__responseKey_grdm-file:.+$/)) {
            return;
        }
        // only validating groups with actual inputs and not groups that are headings/labels only
        if (group.inputBlock) {
            const validationForResponse: ValidatorFunction[] = [];
            const responseKey = group.registrationResponseKey;
            assert(`no response key for group ${group.schemaBlockGroupKey}`, Boolean(responseKey));
            const { inputBlock } = group;
            if (group.groupType === 'file-input') {
                validationForResponse.push(
                    validateFileList(responseKey as string, node),
                );
            }
            if (inputBlock.requiredIf) {
                if (inputBlock.requiredIf.startsWith('{') && inputBlock.requiredIf.endsWith('}')) {
                    const jsonString = inputBlock.requiredIf.replace(/'/g, '"');
                    const requiredIfObject = JSON.parse(jsonString);
                    const requiredIf = Object.keys(requiredIfObject)[0];
                    const requiredifValue = requiredIfObject[requiredIf];
                    validationForResponse.push(
                        validateRequiredIf(requiredIf, requiredifValue, groups),
                    );
                } else {
                    validationForResponse.push(
                        validateRequiredIf(inputBlock.requiredIf, '', groups),
                    );
                }
            }
            if (inputBlock.pattern) {
                const key = (group.registrationResponseKey || '').substr('__responseKey_'.length);
                validationForResponse.push(
                    validateFormat({
                        allowBlank: !inputBlock.required,
                        regex: new RegExp(inputBlock.pattern),
                        type: `invalid_format_${key}`,
                    }),
                );
            }
            // TODO: remove check for contributors-input
            if (inputBlock.required && inputBlock.blockType !== 'contributors-input') {
                validationForResponse.push(
                    validatePresence({
                        presence: true,
                        ignoreBlank: true,
                        allowBlank: false,
                        allowNone: false,
                        type: getErrorType(group.groupType),
                    }),
                );
            }
            ret[responseKey!] = validationForResponse;
        }
    });
    return ret;
}

export function setupEventForSyncValidation(changeset: ChangesetDef, groups: SchemaBlockGroup[]) {
    const requiredIfGroups = groups
        // ignore GRDM file specific fields
        .filter((group: SchemaBlockGroup) => !group.registrationResponseKey
            || !group.registrationResponseKey.match(/^__responseKey_grdm-file:.+$/))
        .filter((group: SchemaBlockGroup) => group.inputBlock && group.inputBlock.requiredIf);
    changeset.on('afterValidation', (key: string) => {
        requiredIfGroups
            .forEach(group => {
                let requiredIf;
                let requiredifValue;
                let condition;
                let messageType: string;
                const contextCurrentValue = changeset.get(key);

                if (group.inputBlock!.requiredIf!.startsWith('{') && group.inputBlock!.requiredIf!.endsWith('}')) {
                    const jsonString = group.inputBlock!.requiredIf!.replace(/'/g, '"');
                    const requiredIfObject = JSON.parse(jsonString);
                    [requiredIf] = Object.keys(requiredIfObject);
                    requiredifValue = requiredIfObject[requiredIf];

                    messageType = 'invalid_required_if_object';
                    condition = !contextCurrentValue || contextCurrentValue === requiredifValue;
                } else {
                    requiredIf = group.inputBlock!.requiredIf;
                    messageType = 'invalid_required_if';
                    condition = !contextCurrentValue;
                }

                if (`__responseKey_${requiredIf}` !== key) {
                    return;
                }
                const errors = changeset.get('errors');
                const otherKey = group.registrationResponseKey as string;
                const validationErrors = errors
                    .filter((error: any) => error.key === otherKey)
                    .flatMap((error: any) => error.validation as Array<string | ValidationResult>)
                    .filter(
                        (result: string | ValidationResult): result is ValidationResult => typeof result === 'object',
                    )
                    .filter(
                        (result: ValidationResult) => result.context.type === messageType,
                    );
                const validatedContextValues: Array<{[key: string]: any}> = validationErrors
                    .filter((result: ValidationResult) => typeof result.value === 'object')
                    .map((result: ValidationResult) => result.value as {[key: string]: any});
                const existMismatchError = validatedContextValues.some(
                    values => values[key] !== contextCurrentValue,
                );
                if (existMismatchError) {
                    changeset.validate(otherKey);
                    return;
                }

                if ((condition) && !validatedContextValues.filter(values => !values[key]).length) {
                    changeset.validate(otherKey);
                }
            });
    });
}

export function setupEventForSyncValidation2(changeset: ChangesetDef, groups: SchemaBlockGroup[]) {
    const requiredAllCheckGroups = groups
        // ignore GRDM file specific fields
        .filter((group: SchemaBlockGroup) => !group.registrationResponseKey
            || !group.registrationResponseKey.match(/^__responseKey_grdm-file:.+$/))
        .filter((group: SchemaBlockGroup) => group.inputBlock && group.inputBlock.requiredAllCheck);

    let isProcesing = false;

    changeset.on('afterValidation', () => {
        if (isProcesing) {
            return;
        }
        isProcesing = true;

        try {
            const checkboxList = requiredAllCheckGroups.map(group => {
                const registrationResponseKey: string = group.registrationResponseKey || '';
                const value = changeset.get(registrationResponseKey);
                return Array.isArray(value) && value.length === 1;
            });

            requiredAllCheckGroups
                .forEach(group => {
                    if (!checkboxList.includes(false)) {
                        const todayDate = `${new Date().getFullYear()}/${
                            String(new Date().getMonth() + 1).padStart(2, '0')
                        }/${
                            String(new Date().getDate()).padStart(2, '0')
                        }`;
                        changeset.set(`__responseKey_${group.inputBlock!.requiredAllCheck}`, todayDate);
                    } else {
                        changeset.set(`__responseKey_${group.inputBlock!.requiredAllCheck}`, '');
                    }
                });
        } finally {
            isProcesing = false;
        }
    });
}

export function validateNodeLicense() {
    return async (_: unknown, __: unknown, ___: unknown, changes: DraftRegistration, content: DraftRegistration) => {
        let validateLicenseTarget = await content.license;
        let validateNodeLicenseTarget = content.nodeLicense;
        if (changes.license) {
            validateLicenseTarget = changes.license;
        }
        if (changes.nodeLicense) {
            validateNodeLicenseTarget = changes.nodeLicense;
        }
        if (!validateLicenseTarget || validateLicenseTarget.get('requiredFields').length === 0) {
            return true;
        }
        const missingFieldsList: Array<keyof NodeLicense> = [];
        for (const item of validateLicenseTarget.get('requiredFields')) {
            if (!validateNodeLicenseTarget || !validateNodeLicenseTarget[item]) {
                missingFieldsList.push(item);
            }
        }
        if (missingFieldsList.length === 0) {
            return true;
        }
        const missingFields = missingFieldsList.map(field => NodeLicenseFields[field]).join(', ');
        return {
            context: {
                type: 'node_license_missing_fields',
                translationArgs: {
                    missingFields,
                    numOfFields: missingFieldsList.length,
                },
            },
        };
    };
}

export function validateNodeLicenseYear() {
    return (_: unknown, __: unknown, ___: unknown, changes: any, content: DraftRegistration) => {
        let validateYearTarget: string = '';
        if (content.nodeLicense && content.nodeLicense.year) {
            validateYearTarget = content.nodeLicense.year;
        }
        if (changes.nodeLicense && changes.nodeLicense.year) {
            validateYearTarget = changes.nodeLicense.year;
        }
        const regex = /^((?!(0))[0-9]{4})$/;
        if (validateYearTarget && !validateYearTarget.match(regex)) {
            return {
                context: {
                    type: 'year_format',
                },
            };
        }
        return true;
    };
}

export function validateSubjects() {
    return (_: unknown, __: unknown, ___: unknown, ____: unknown, content: DraftRegistration) => {
        const subjects = content.hasMany('subjects').value();
        if (!subjects || subjects.length === 0) {
            return {
                context: {
                    type: 'min_subjects',
                },
            };
        }
        return true;
    };
}

export function buildMetadataValidations() {
    const validationObj: ValidationObject<DraftRegistration> = {};
    const notBlank: ValidatorFunction[] = [validatePresence({
        presence: true,
        ignoreBlank: true,
        allowBlank: false,
        allowNone: false,
        type: 'blank',
    })];
    set(validationObj, DraftMetadataProperties.Title, notBlank);
    set(validationObj, DraftMetadataProperties.Description, notBlank);
    set(validationObj, DraftMetadataProperties.License, notBlank);
    set(validationObj, DraftMetadataProperties.Subjects, validateSubjects());
    set(validationObj, DraftMetadataProperties.NodeLicenseProperty, [validateNodeLicense(), validateNodeLicenseYear()]);
    return validationObj;
}

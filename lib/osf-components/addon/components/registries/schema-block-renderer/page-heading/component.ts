import { tagName } from '@ember-decorators/component';
import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

import Intl from 'ember-intl/services/intl';
import { layout } from 'ember-osf-web/decorators/component';
import { SchemaBlock } from 'ember-osf-web/packages/registration-schema';
import styles from './styles';
import template from './template';

@layout(template, styles)
@tagName('')
export default class PageHeading extends Component {
    @service intl!: Intl;
    // Required params
    schemaBlock!: SchemaBlock;

    @computed('schemaBlock')
    get localizedDisplayText() {
        const text = this.schemaBlock.displayText;
        if (!text) {
            return text;
        }
        return this.getLocalizedText(text);
    }

    @computed('schemaBlock')
    get localizedHelpText() {
        const text = this.schemaBlock.helpText;
        if (!text) {
            return [];
        }

        const localizedText = this.getLocalizedText(text);

        const urlPattern = /(https?:\/\/[^\s]+)/g;

        const lines = localizedText.split('\n').map(line => {
            const parts = line.split(urlPattern).map(part => (
                urlPattern.test(part)
                    ? { type: 'link', content: part.trim() }
                    : { type: 'text', content: part.trim() }
            ));
            return parts;
        });

        return lines;
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

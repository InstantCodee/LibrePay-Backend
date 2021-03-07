import { readdir } from 'fs';
import { join } from 'path';
import { config } from '../../config';
import { invoiceManager, logger, providerManager } from '../app';
import { BackendProvider } from './backendProvider';
import { CryptoUnits } from './types';

export class ProviderManager {

    providerFilePath: string;
    cryptoProvider: Map<CryptoUnits, BackendProvider>;

    constructor(filePath: string) {
        this.providerFilePath = filePath;
        this.cryptoProvider = new Map<CryptoUnits, BackendProvider>();
    }

    getProvider(crypto: CryptoUnits): BackendProvider | undefined {
        return this.cryptoProvider.get(crypto);
    }

    /**
     * Scan & load all found providers
     */
    async scan() {
        return new Promise<void>(async (resolve, reject) => {
            await readdir(this.providerFilePath, { withFileTypes: true }, async (err, files) => {
                const directories = files.filter(dirent => dirent.name.endsWith('.ts'))
                    .map(dirent => dirent.name);
                for (let i = 0; i < directories.length; i++) {
                    const file = directories[i];
                    const absolutePath = join(this.providerFilePath, file);
                    const providerModule = require(absolutePath);
                    const provider = new providerModule.Provider() as BackendProvider;

                    provider.CRYPTO.forEach(crypto => {
                        if (this.cryptoProvider.has(crypto)) {
                            logger.warn(`Provider ${provider.NAME} will not be activated for ${provider.CRYPTO} since there is already another provider in place.`);
                        } else {
                            this.cryptoProvider.set(crypto, provider);
                            config.payment.methods.push(crypto);
                        }
                    });

                    // Execute onEnable() function of this provider
                    try {
                        await provider.onEnable();
                        logger.info(`Loaded provider "${provider.NAME}" by ${provider.AUTHOR} (${provider.VERSION}) for ${provider.CRYPTO.join(', ')}` +
                        (await provider.isTestnet() ? ' (running in testnet mode)' : ''));
                    } catch (err) {
                        logger.error(`Provider "${provider.NAME}" by ${provider.AUTHOR} (${provider.VERSION}) failed to start: ${err}`);
                        this.disable(provider);
                    }
                }

                if (this.cryptoProvider.size === 0) {
                    reject('No providers were initialized!');
                    return;
                }

                resolve();
            });
        });
    }

    /**
     * This provider will be no longer be used.
     */
    disable(provider: BackendProvider) {
        this.cryptoProvider.forEach(cryptoProvider => {
            if (provider === cryptoProvider) {
                // Disable all coins that are supported by this provider.
                provider.CRYPTO.forEach(crypto => {
                    this.cryptoProvider.delete(crypto);
                    config.payment.methods.splice(config.payment.methods.indexOf(crypto), 1);
                });
                logger.warning(`Provider "${provider.NAME}" is now disabled.`);
            }
        });
    }

}
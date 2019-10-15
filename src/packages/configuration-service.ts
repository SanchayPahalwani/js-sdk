import { getLogger } from "..";
import config from "../config";
import {ErrorHelper, PackageErrorCode} from "./error";
import { getContentFromGaiaHub, getGaiaDataFromBlockstackID } from "./gaia-service/utils";
import * as identityUtils from "./identity-utils";
import * as nameservice from "./name-service/blockstack-service";
import { IBlockstackServiceInputOptions } from "./name-service/blockstack-service";

const log = getLogger(__filename);
const CONFIG_SUBDOMAIN = "_config";

export abstract class NameServiceConfigurationService {
    constructor() {
        log.info(`Initizing NameServiceConfigurationService with options:- `);
    }

    public abstract getGlobalAssetList = async (): Promise<object> => ({});
    public abstract getClientAssetMapping = async (clientName: string): Promise<object> => ({});
    public abstract getClientConfig = async (clientName: string): Promise<any> => ({});
}

export class BlockstackConfigurationService extends NameServiceConfigurationService {

    private blockstackNameservice: nameservice.BlockstackService;
    private clientName: string;
    private clientConfig: any;
    private blockstackID: string | undefined;

    constructor(clientName: string, cruxID?: string) {
        super();
        this.clientName = clientName;
        if (cruxID) {
            this.blockstackID = identityUtils.IdTranslator.cruxToBlockstack(identityUtils.CruxId.fromString(cruxID)).toString();
        }
        this.blockstackNameservice = new nameservice.BlockstackService({domain: this.clientName + identityUtils.CRUX_DOMAIN_SUFFIX});
        log.info(`BlockstackConfigurationService initialised with default configs`);
    }

    public init = async () => {
        this.clientConfig = await this.getClientConfig(this.clientName);
    }

    public getGlobalAssetList = async (): Promise<object> => {
        const clientConfig = this.clientConfig;
        if (clientConfig && clientConfig.assetList) {
            return clientConfig.assetList;
        } else {
            throw ErrorHelper.getPackageError(PackageErrorCode.CouldNotFindAssetListInClientConfig);
        }
    }

    public getClientConfig = async (clientName: string): Promise<any> => {
        const blockstackId = new identityUtils.BlockstackId({
            domain: this.clientName + identityUtils.CRUX_DOMAIN_SUFFIX,
            subdomain: CONFIG_SUBDOMAIN,
        }).toString();
        return await getContentFromGaiaHub(blockstackId, nameservice.UPLOADABLE_JSON_FILES.CLIENT_CONFIG, config.BLOCKSTACK.BNS_NODES, clientName);
    }

    public getClientAssetMapping = async (): Promise<object> => {
        const clientConfig = await this.clientConfig;
        const lowerAssetMapping: any = {};
        if (clientConfig.assetMapping) {
            for (const walletCurrencySymbol of Object.keys(clientConfig.assetMapping)) {
                lowerAssetMapping[walletCurrencySymbol.toLowerCase()] = clientConfig.assetMapping[walletCurrencySymbol];
            }
            return lowerAssetMapping;
        } else {
            return {};
        }
    }

    public getBlockstackServiceForConfig = async (): Promise<nameservice.BlockstackService> => {
        if (!this.clientConfig) { throw ErrorHelper.getPackageError(PackageErrorCode.CouldNotFindBlockstackConfigurationServiceClientConfig); }
        let ns: nameservice.BlockstackService;
        let gaiaHub: string | undefined;
        if (this.blockstackID) {
            const gaiaUrls = await getGaiaDataFromBlockstackID(this.blockstackID, (this.clientConfig.nameserviceConfiguration && this.clientConfig.nameserviceConfiguration.bnsNodes) || config.BLOCKSTACK.BNS_NODES);
            gaiaHub = gaiaUrls.gaiaWriteUrl;
        }
        const domain = this.clientName + identityUtils.CRUX_DOMAIN_SUFFIX;
        const nsConfiguration: IBlockstackServiceInputOptions = {
            domain,
            gaiaHub,
        };
        if (this.clientConfig.nameserviceConfiguration) {
            nsConfiguration.bnsNodes = this.clientConfig.nameserviceConfiguration.bnsNodes;
            nsConfiguration.domain = domain;
            nsConfiguration.gaiaHub = gaiaHub || this.clientConfig.nameserviceConfiguration.gaiaHub;
            nsConfiguration.subdomainRegistrar = this.clientConfig.nameserviceConfiguration.subdomainRegistrar;
        }
        ns = new nameservice.BlockstackService(nsConfiguration);
        return ns;
    }

}

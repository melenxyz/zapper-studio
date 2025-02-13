import { Inject } from '@nestjs/common';

import { IAppToolkit, APP_TOOLKIT } from '~app-toolkit/app-toolkit.interface';
import { Register } from '~app-toolkit/decorators';
import { buildDollarDisplayItem } from '~app-toolkit/helpers/presentation/display-item.present';
import { getImagesFromToken } from '~app-toolkit/helpers/presentation/image.present';
import { ContractType } from '~position/contract.interface';
import { PositionFetcher } from '~position/position-fetcher.interface';
import { AppTokenPosition } from '~position/position.interface';
import { Network } from '~types/network.interface';

import { UmamiContractFactory } from '../contracts';
import { UMAMI_DEFINITION } from '../umami.definition';

const appId = UMAMI_DEFINITION.id;
const groupId = UMAMI_DEFINITION.groups.compound.id;
const network = Network.ARBITRUM_MAINNET;

@Register.TokenPositionFetcher({ appId, groupId, network })
export class ArbitrumUmamiCompoundTokenFetcher implements PositionFetcher<AppTokenPosition> {
  constructor(
    @Inject(APP_TOOLKIT) private readonly appToolkit: IAppToolkit,
    @Inject(UmamiContractFactory) private readonly umamiContractFactory: UmamiContractFactory,
  ) {}

  async getPositions() {
    const mUMAMI_ADDRESS = '0x2AdAbD6E8Ce3e82f52d9998a7f64a90d294A92A4'.toLowerCase();
    const cmUMAMI_ADDRESS = '0x1922C36F3bc762Ca300b4a46bB2102F84B1684aB'.toLowerCase();
    const multicall = this.appToolkit.getMulticall(network);

    const underlyingTokenContract = this.umamiContractFactory.umamiMarinate({
      address: mUMAMI_ADDRESS,
      network,
    });
    const contract = this.umamiContractFactory.umamiCompound({
      address: cmUMAMI_ADDRESS,
      network,
    });

    const appTokens = await this.appToolkit.getAppTokenPositions({
      appId: 'umami',
      groupIds: ['marinate'],
      network,
    });
    const [symbol, decimals, supplyRaw, balanceRaw] = await Promise.all([
      multicall.wrap(contract).symbol(),
      multicall.wrap(contract).decimals(),
      multicall.wrap(contract).totalSupply(),
      multicall.wrap(underlyingTokenContract).balanceOf(cmUMAMI_ADDRESS),
    ]);
    const underlyingToken = appTokens.find(v => v.address === mUMAMI_ADDRESS);

    if (!underlyingToken) return [];

    const supply = Number(supplyRaw) / 10 ** decimals;
    const reserve = Number(balanceRaw) / 10 ** decimals;
    const pricePerShare = reserve / supply;
    const price = pricePerShare * underlyingToken.price;
    const tokens = [underlyingToken];

    const label = `Compounding Marinated UMAMI`;
    const images = getImagesFromToken(underlyingToken);
    const secondaryLabel = buildDollarDisplayItem(price);
    const tertiaryLabel = `${pricePerShare}`;

    const token: AppTokenPosition = {
      type: ContractType.APP_TOKEN,
      appId,
      groupId,
      address: cmUMAMI_ADDRESS,
      network,
      symbol,
      decimals,
      supply,
      pricePerShare,
      price,
      tokens,
      dataProps: {
        pricePerShare: `${pricePerShare}`,
      },
      displayProps: {
        label,
        images,
        secondaryLabel,
        tertiaryLabel,
      },
    };
    return [token];
  }
}

import { Inject } from '@nestjs/common';
import { XArgoPledging } from '../contracts';
import { IAppToolkit, APP_TOOLKIT } from '~app-toolkit/app-toolkit.interface';
import { Register } from '~app-toolkit/decorators';
import { PositionFetcher } from '~position/position-fetcher.interface';
import { buildDollarDisplayItem } from '~app-toolkit/helpers/presentation/display-item.present';
import { getImagesFromToken } from '~app-toolkit/helpers/presentation/image.present';
import { ContractType } from '~position/contract.interface';
import { ContractPosition } from '~position/position.interface';
import { claimable, supplied } from "~position/position.utils";
import { Network } from '~types/network.interface';

import { ARGO_FINANCE_DEFINITION } from '../argo-finance.definition';
import { ArgoFinanceContractFactory } from '../contracts';
import { ADDRESSES } from './consts';

const appId = ARGO_FINANCE_DEFINITION.id;
const groupId = ARGO_FINANCE_DEFINITION.groups.pledging.id;
const network = Network.CRONOS_MAINNET;

@Register.ContractPositionFetcher({ appId, groupId, network })
export class CronosArgoFinancePledgingContractPositionFetcher implements PositionFetcher<ContractPosition> {
  constructor(
    @Inject(APP_TOOLKIT) private readonly appToolkit: IAppToolkit,
    @Inject(ArgoFinanceContractFactory) private readonly argoFinanceContractFactory: ArgoFinanceContractFactory,
  ) { }

  async getVePosition(address: string, baseAddress: string) {
    const multicall = this.appToolkit.getMulticall(network);
    const baseTokens = await this.appToolkit.getBaseTokenPrices(network);
    const contractTokens = await this.appToolkit.getAppTokenPositions({
      appId,
      groupIds: [groupId],
      network,
    })
    let baseToken = contractTokens.find(t => t.symbol === 'xARGO')!;
    let croToken = baseTokens.find(t => t.symbol === "WCRO")!;
    const veToken = multicall.wrap(this.appToolkit.globalContracts.erc20({ address, network }));
    const [supplyRaw, decimals, symbol] = await Promise.all([
      veToken.totalSupply(),
      veToken.decimals(),
      veToken.symbol(),
    ]);
    const supply = Number(supplyRaw) / 10 ** decimals;
    const pricePerShare = 1; // Note: Consult liquidity pools for peg once set up
    const price = baseToken.price * pricePerShare;
    const liquidity = supply * price;

    const tokens = [supplied(baseToken), claimable(baseToken), claimable(croToken)];
    const position: ContractPosition =
    {
      type: ContractType.POSITION,
      appId,
      groupId,
      address: ADDRESSES.pledging,
      network,
      tokens,
      dataProps: {

      },
      displayProps: {
        label: "xARGO",
        secondaryLabel: buildDollarDisplayItem(price),
        images: getImagesFromToken(baseToken),
      },
    };
    return position;
  }

  async getPositions() {
    const [argo] = await Promise.all([
      this.getVePosition(ADDRESSES.xargo, ADDRESSES.argo),
    ]);
    return [argo];
  }
}

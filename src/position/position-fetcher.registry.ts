import { Inject, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { compact } from 'lodash';

import { Network } from '~types/network.interface';
import { Registry } from '~utils/build-registry';

import { ContractType } from './contract.interface';
import { DefaultDataProps } from './display.interface';
import {
  POSITION_FETCHER_APP,
  POSITION_FETCHER_NETWORK,
  POSITION_FETCHER_GROUP,
  POSITION_FETCHER_TYPE,
  POSITION_FETCHER_OPTIONS,
  PositionOptions,
} from './position-fetcher.decorator';
import { PositionFetcher } from './position-fetcher.interface';
import { AbstractPosition, Position } from './position.interface';

export class PositionFetcherRegistry implements OnModuleInit {
  private registry: Registry<
    [ContractType, Network, string, string],
    { fetcher: PositionFetcher<Position>; options: PositionOptions }
  > = new Map();

  constructor(@Inject(DiscoveryService) private readonly discoveryService: DiscoveryService) {}

  onModuleInit() {
    const wrappers = this.discoveryService.getProviders();

    wrappers
      .filter(
        wrapper =>
          wrapper.metatype &&
          Reflect.getMetadata(POSITION_FETCHER_APP, wrapper.metatype) &&
          Reflect.getMetadata(POSITION_FETCHER_NETWORK, wrapper.metatype) &&
          Reflect.getMetadata(POSITION_FETCHER_GROUP, wrapper.metatype) &&
          Reflect.getMetadata(POSITION_FETCHER_TYPE, wrapper.metatype),
      )
      .forEach(wrapper => {
        const type = Reflect.getMetadata(POSITION_FETCHER_TYPE, wrapper.metatype);
        const network = Reflect.getMetadata(POSITION_FETCHER_NETWORK, wrapper.metatype);
        const appId = Reflect.getMetadata(POSITION_FETCHER_APP, wrapper.metatype);
        const groupId = Reflect.getMetadata(POSITION_FETCHER_GROUP, wrapper.metatype);
        const options = Reflect.getMetadata(POSITION_FETCHER_OPTIONS, wrapper.metatype);

        if (!this.registry.get(type)) this.registry.set(type, new Map());
        if (!this.registry.get(type)!.get(network)) this.registry.get(type)!.set(network, new Map());
        if (!this.registry.get(type)!.get(network)!.get(appId))
          this.registry.get(type)!.get(network)!.set(appId, new Map());

        this.registry.get(type)?.get(network)?.get(appId)?.set(groupId, { fetcher: wrapper.instance, options });
      });
  }

  private getOptions({
    type,
    network,
    appId,
    groupId,
  }: {
    type: ContractType;
    network: Network;
    appId: string;
    groupId: string;
  }) {
    const positionWithOptions = this.registry.get(type)?.get(network)?.get(appId)?.get(groupId);
    return positionWithOptions?.options ?? {};
  }

  get<T extends AbstractPosition<V>, V = DefaultDataProps>({
    type,
    network,
    appId,
    groupId,
  }: {
    type: ContractType;
    network: Network;
    appId: string;
    groupId: string;
  }): PositionFetcher<T, V> {
    const positionFetcher = this.registry.get(type)?.get(network)?.get(appId)?.get(groupId);
    if (!positionFetcher) throw new Error('No position fetcher found');
    return positionFetcher.fetcher as unknown as PositionFetcher<T, V>;
  }

  getGroupIdsForApp({ type, network, appId }: { type: ContractType; network: Network; appId: string }) {
    const appFetchers = this.registry.get(type)?.get(network)?.get(appId);
    return Array.from(appFetchers?.keys() ?? []);
  }

  getTvlEnabledGroupsIds({ network, appId }: { network: Network; appId: string }) {
    const types = [ContractType.APP_TOKEN, ContractType.POSITION] as const;

    const groupIds = types.map(type => {
      const groupIds = this.getGroupIdsForApp({ type, network, appId });
      const tvlEnabledGroupIds = groupIds.filter(
        groupId => this.getOptions({ type, appId, groupId, network }).includeInTvl,
      );
      return { type, groupIds: compact(tvlEnabledGroupIds) };
    });

    return groupIds as [
      { type: ContractType.APP_TOKEN; groupIds: string[] },
      { type: ContractType.POSITION; groupIds: string[] },
    ];
  }
}

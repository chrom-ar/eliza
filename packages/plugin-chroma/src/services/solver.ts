import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';

import SolverSDK from "@chrom-ar/solver-sdk";

import { validateAndBuildProposal } from '../solver';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SolverService extends Service {
  private initialized = false;
  private runtime: IAgentRuntime;
  private solver: any;

  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return "Solver" as ServiceType // ServiceType.WAKU_MESSAGING;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    // TODO: Drop SKIP_SOLVER when solver is in other repo
    if (runtime.getSetting('SKIP_SOLVER') || this.initialized) {
      return
    }

    this.runtime = runtime;

    this.solver = await SolverSDK.start(validateAndBuildProposal, elizaLogger)

    elizaLogger.info('[SolverService] initialized');

    this.initialized = true;
  }
}

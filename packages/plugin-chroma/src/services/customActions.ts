import fs from 'fs';
import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';

export class CustomActionsService extends Service {
  private initialized = false;
  private runtime: IAgentRuntime;

  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return "CustomActions" as ServiceType // ServiceType.WAKU_MESSAGING;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    // TODO: Drop SKIP_SOLVER when solver is in other repo
    if (this.initialized) {
      return
    }

    this.runtime = runtime;

    elizaLogger.info('[CustomActionsService] initialized');

    this.initialized = true;

    console.log("Import url: ", import.meta.url)
    const dir = new URL("../custom_actions", import.meta.url)
    console.log("Dir: ", dir)
    try {
        fs.readdirSync(dir.pathname).forEach(file => {
            console.log("File: ", file)
            import(dir.pathname + "/" + file).then(action => {
                console.log("Action: ", action.default)
                this.runtime.registerAction(action.default)
            }).catch(error => {
                console.error("Error: ", error)
            })
        })
    } catch (error) {
        console.error("Error: ", error)
    }

    elizaLogger.info('[CustomActionsService] actions registered');
  }
}

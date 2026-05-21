declare namespace chrome {
  namespace runtime {
    function getURL(path: string): string;
    const onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ) => void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      windowId?: number;
    }
    function query(queryInfo: {
      url?: string | string[];
      active?: boolean;
      currentWindow?: boolean;
    }): Promise<Tab[]>;
    function captureVisibleTab(
      windowId: number,
      options: { format: 'png' | 'jpeg' }
    ): Promise<string>;
    const onUpdated: {
      addListener: (callback: () => void) => void;
    };
  }

  namespace scripting {
    function executeScript(injection: {
      target: { tabId: number };
      world?: 'MAIN' | 'ISOLATED';
      func: (...args: unknown[]) => unknown;
      args?: unknown[];
    }): Promise<Array<{ result?: unknown }>>;
  }
}

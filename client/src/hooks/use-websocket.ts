import { useEffect, useRef, useCallback } from "react";
import { wsClient } from "@/lib/websocket";

export function useWebSocket(
  type: string,
  callback: (data: any) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.on(type, (msg) => {
      callbackRef.current(msg.data);
    });
    return unsub;
  }, [type]);

  const send = useCallback((msgType: string, data: any) => {
    wsClient.send({ type: msgType, data });
  }, []);

  return { send };
}

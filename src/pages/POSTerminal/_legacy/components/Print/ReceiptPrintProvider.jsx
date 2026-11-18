import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ReceiptModal from '../Payment/ReceiptModal';

const ReceiptPrintContext = createContext(null);

export const useReceiptPrint = () => {
  const requestReceiptPrint = useContext(ReceiptPrintContext);
  if (!requestReceiptPrint) {
    throw new Error('useReceiptPrint must be used inside ReceiptPrintProvider.');
  }
  return requestReceiptPrint;
};

const ReceiptPrintProvider = ({ children }) => {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const finishRequest = useCallback((printed) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(printed);
  }, []);

  const requestReceiptPrint = useCallback((nextRequest) => new Promise((resolve) => {
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setRequest(nextRequest);
  }), []);

  useEffect(() => () => {
    resolveRef.current?.(false);
  }, []);

  return (
    <ReceiptPrintContext.Provider value={requestReceiptPrint}>
      {children}
      {request && (
        <ReceiptModal
          transaction={request.transaction}
          outletName={request.outletName}
          cashierName={request.cashierName}
          cancelLabel="Cancel"
          onClose={() => finishRequest(false)}
          onNewOrder={() => finishRequest(false)}
          onPrinted={() => finishRequest(true)}
        />
      )}
    </ReceiptPrintContext.Provider>
  );
};

export default ReceiptPrintProvider;

import { Send, CheckCircle, XCircle, Clock, RotateCcw, AlertCircle } from 'lucide-react';
import { useComponentStore } from '../stores/componentStore';

export function SubmitPanel() {
  const { parsedSchemas, results, isSubmitting, submitAll, clearResults, addLog } = useComponentStore();

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Send className="w-5 h-5" />
          Submit to API
        </h2>
        {results.length > 0 && (
          <div className="flex items-center gap-4">
            {successCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                {successCount} succeeded
              </span>
            )}
            {failCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <XCircle className="w-4 h-4" />
                {failCount} failed
              </span>
            )}
            <button
              onClick={clearResults}
              className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <AlertCircle className="w-5 h-5 text-gray-400" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Ready to submit <strong>{parsedSchemas.length}</strong> component(s) to the API.
          {failCount > 0 && ` Previous run had ${failCount} failures.`}
        </p>
        <button
          onClick={() => {
            addLog(`Submitting ${parsedSchemas.length} schema(s) to API...`, 'info');
            submitAll().then(() => {
              const { results } = useComponentStore.getState();
              const ok = results.filter((r) => r.success).length;
              const fail = results.filter((r) => !r.success).length;
              if (fail > 0) {
                addLog(`Submit complete: ${ok} created, ${fail} failed`, 'warn');
              } else {
                addLog(`Submit complete: ${ok} schema(s) created successfully`, 'success');
              }
            });
          }}
          disabled={parsedSchemas.length === 0 || isSubmitting}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
        >
          {isSubmitting ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit All
            </>
          )}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.map((result, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-xl border ${
                result.success
                  ? 'bg-green-900/10 border-green-800/50'
                  : 'bg-red-900/10 border-red-800/50'
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {result.schema.componentKey}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.message}</p>
                {result.id && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">ID: {result.id}</p>
                )}
                {result.errorCode && (
                  <p className="text-xs text-red-400 mt-0.5">Error: {result.errorCode}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
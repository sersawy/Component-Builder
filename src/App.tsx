import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from './stores/authStore';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { JsonEditor } from './components/JsonEditor';
import { SubmitPanel } from './components/SubmitPanel';

export default function App() {
  const { isAuthenticated, isLoading, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm />
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">
        <JsonEditor />
        <SubmitPanel />
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
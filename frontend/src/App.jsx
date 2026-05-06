import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppRouter from './app/router/AppRouter';
import { AuthProvider } from './features/auth/hooks/useAuth';

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3200,
            style: {
              borderRadius: '12px',
              border: '1px solid #dbeafe',
              background: '#ffffff',
              color: '#0f172a',
              boxShadow: '0 18px 55px rgba(15, 23, 42, 0.14)',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

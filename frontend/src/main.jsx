import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css'; 

// We define a 10-step color palette for Mantine, placing your exact brand color (#194c81) at the end.
const greninjaBlue = [
  '#f1f5fa',
  '#dbe5f2',
  '#b1c6e5',
  '#84a6d7',
  '#5f8acd',
  '#4777c6',
  '#386cc4',
  '#2a5aae',
  '#22509c',
  '#194c81' // Index 9: Your exact Greninja Dark Blue
];

const greninjaTheme = createTheme({
  // 1. Force the modern font everywhere
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  headings: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
  },
  
  // 2. Set your custom brand blue as the default app color
  colors: {
    greninja: greninjaBlue,
  },
  primaryColor: 'greninja',
  primaryShade: 9, 
  
  // 3. Apply the soft rounded corners to ALL components globally
  defaultRadius: 'md',

  // 4. Component-specific global overrides
  components: {
    Card: {
      defaultProps: {
        shadow: 'sm',
        withBorder: true,
      },
    },
    Button: {
      defaultProps: {
        fw: 600, // Makes all button text slightly bolder for a modern look
      }
    },
    TextInput: {
      defaultProps: { variant: 'filled' } // Gives inputs a modern, soft grey background
    },
    PasswordInput: {
      defaultProps: { variant: 'filled' }
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={greninjaTheme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
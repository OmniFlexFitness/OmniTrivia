import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { GamePhase } from './types';
import StartScreen from './components/StartScreen';
import HostConfigScreen from './components/HostConfigScreen';
import ReviewScreen from './components/ReviewScreen';
import JoinScreen from './components/JoinScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';

const AppContent: React.FC = () => {
  const { phase } = useGame();

  switch (phase) {
    case GamePhase.START:
      return <StartScreen />;
    case GamePhase.HOST_CONFIG:
      return <HostConfigScreen />;
    case GamePhase.REVIEW:
      return <ReviewScreen />;
    case GamePhase.JOIN:
      return <JoinScreen />;
    case GamePhase.LOBBY:
      return <LobbyScreen />;
    default:
      return <GameScreen />;
  }
};

const App: React.FC = () => {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
};

export default App;
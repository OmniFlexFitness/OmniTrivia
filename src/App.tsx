import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { GamePhase } from './types';
import { isBroadcastView, isRemoteView } from './services/broadcastBus';
import StartScreen from './components/StartScreen';
import HostConfigScreen from './components/HostConfigScreen';
import ImportScreen from './components/ImportScreen';
import ImportSelectScreen from './components/ImportSelectScreen';
import ReviewScreen from './components/ReviewScreen';
import JoinScreen from './components/JoinScreen';
import HostResumeScreen from './components/HostResumeScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import PlayerScreen from './components/PlayerScreen';
import HostControlScreen from './components/HostControlScreen';
import BroadcastScreen from './components/BroadcastScreen';
import RemoteControlScreen from './components/RemoteControlScreen';

const AppContent: React.FC = () => {
  const { phase, isHost, clientPin } = useGame();

  // A tab that joined someone else's room owns no game state — it renders the
  // host's snapshot and posts answers back.
  if (clientPin) return <PlayerScreen />;

  switch (phase) {
    case GamePhase.START:
      return <StartScreen />;
    case GamePhase.HOST_CONFIG:
      return <HostConfigScreen />;
    case GamePhase.IMPORT:
      return <ImportScreen />;
    case GamePhase.IMPORT_SELECT:
      return <ImportSelectScreen />;
    case GamePhase.REVIEW:
      return <ReviewScreen />;
    case GamePhase.JOIN:
      return <JoinScreen />;
    case GamePhase.HOST_RESUME:
      return <HostResumeScreen />;
    case GamePhase.LOBBY:
      return <LobbyScreen />;
    default:
      // Once the game is running the host drives it from the control screen and
      // the room watches the broadcast window. Everyone else plays along on the
      // player screen.
      return isHost ? <HostControlScreen /> : <GameScreen />;
  }
};

const App: React.FC = () => {
  // The projector view is a separate window with no game state of its own: it
  // renders whatever the host window publishes, so it stays outside the
  // provider entirely and can never mutate the game.
  if (isBroadcastView()) {
    return <BroadcastScreen />;
  }

  // The host's remote is the same kind of window: it holds no game, renders
  // the host's snapshot, and sends the host window commands to carry out. It
  // must not be a second GameProvider, or a tablet would become a second host.
  if (isRemoteView()) {
    return <RemoteControlScreen />;
  }

  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
};

export default App;

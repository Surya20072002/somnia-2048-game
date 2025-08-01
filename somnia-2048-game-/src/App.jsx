import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, getDocs } from 'firebase/firestore';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wallet, RefreshCcw, Trophy, X } from 'lucide-react';

// Load the ethers library from a CDN since direct npm imports are not available
// This makes the 'ethers' object available on the global window object
<script src="https://cdn.jsdelivr.net/npm/ethers@6.11.1/dist/ethers.umd.min.js"></script>

// Use this for firebase initialization and auth
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Firebase initialization
const app = firebaseConfig.projectId ? initializeApp(firebaseConfig) : undefined;
const db = app ? getFirestore(app) : undefined;
const auth = app ? getAuth(app) : undefined;

// Smart Contract Details
const CONTRACT_ADDRESS = '0xE9D26E2A2c5e776205244d60A6769EB28Fce81D6';
const CONTRACT_ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "player",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newScore",
				"type": "uint256"
			}
		],
		"name": "NewHighScore",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_score",
				"type": "uint256"
			}
		],
		"name": "submitHighScore",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_player",
				"type": "address"
			}
		],
		"name": "getHighScore",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "highScores",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

// The main game component
const App = () => {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [saveScoreLoading, setSaveScoreLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState([]);

  // Constants for the game board
  const BOARD_SIZE = 4;
  const WINNING_TILE = 2048;

  // Colors for the tiles based on their value
  const tileColors = {
    0: 'bg-slate-700',
    2: 'bg-slate-100 text-slate-800',
    4: 'bg-slate-200 text-slate-800',
    8: 'bg-sky-300 text-slate-800',
    16: 'bg-sky-400 text-white',
    32: 'bg-sky-500 text-white',
    64: 'bg-sky-600 text-white',
    128: 'bg-blue-700 text-white',
    256: 'bg-blue-800 text-white',
    512: 'bg-indigo-700 text-white',
    1024: 'bg-indigo-800 text-white',
    2048: 'bg-fuchsia-600 text-white',
  };

  const getTileClassName = (value) => {
    let className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-lg flex items-center justify-center font-bold text-2xl transition-all duration-200 ease-in-out';
    className += ' ' + (tileColors[value] || 'bg-slate-700');
    if (value > 100) {
      className += ' text-lg';
    }
    if (value >= 1024) {
      className += ' text-base';
    }
    return className;
  };

  // Firebase Auth and Firestore Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (auth && initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else if (auth) {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Firebase auth error:', error);
      }
      setIsAuthReady(true);
    };

    if (app && !isAuthReady) {
      initAuth();
    }
  }, [app, isAuthReady]);

  // Set up auth state listener
  useEffect(() => {
    if (auth) {
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          setFirebaseUser(user);
          setUsername(`Player ${user.uid.substring(0, 4)}`); // Set a default username
        } else {
          setFirebaseUser(null);
        }
      });
      return () => unsubscribe();
    }
  }, [auth]);
  
  // High Score Logic and Leaderboard fetching
  useEffect(() => {
    if (db && firebaseUser) {
      // Fetch private high score
      const userScoresCollectionPath = `artifacts/${appId}/users/${firebaseUser.uid}/scores`;
      const userDocRef = doc(db, userScoresCollectionPath, 'high-score');
      const unsubscribeUserScore = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data && data.highScore) {
            setHighScore(data.highScore);
          }
        }
      }, (error) => {
        console.error("Error fetching user high score:", error);
      });

      // Fetch public leaderboard
      const leaderboardCollectionPath = `artifacts/${appId}/public/data/leaderboard`;
      const q = query(collection(db, leaderboardCollectionPath));
      const unsubscribeLeaderboard = onSnapshot(q, (querySnapshot) => {
        const scores = [];
        querySnapshot.forEach((doc) => {
          scores.push(doc.data());
        });
        // Sort the leaderboard by high score descending
        scores.sort((a, b) => b.highScore - a.highScore);
        setLeaderboardData(scores);
      }, (error) => {
        console.error("Error fetching leaderboard:", error);
      });

      return () => {
        unsubscribeUserScore();
        unsubscribeLeaderboard();
      };
    }
  }, [db, firebaseUser]);


  const saveHighScoreToFirestore = async (newHighScore) => {
    if (db && firebaseUser) {
      const userId = firebaseUser.uid;
      const userScoresCollectionPath = `artifacts/${appId}/users/${userId}/scores`;
      const leaderboardCollectionPath = `artifacts/${appId}/public/data/leaderboard`;

      try {
        // Save to private user data
        await setDoc(doc(db, userScoresCollectionPath, 'high-score'), {
          highScore: newHighScore,
          timestamp: Date.now()
        }, { merge: true });
        console.log("Private high score updated successfully!");

        // Save to public leaderboard
        await setDoc(doc(db, leaderboardCollectionPath, userId), {
          userId: userId,
          username: username,
          highScore: newHighScore,
          timestamp: Date.now()
        }, { merge: true });
        console.log("Public leaderboard updated successfully!");
      } catch (e) {
        console.error("Error saving high score to Firestore: ", e);
      }
    }
  };


  const initializeBoard = () => {
    const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
    spawnRandomTile(newBoard);
    spawnRandomTile(newBoard);
    setBoard(newBoard);
    setScore(0);
    setIsGameOver(false);
  };

  const spawnRandomTile = (currentBoard) => {
    const emptyCells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }
    if (emptyCells.length > 0) {
      const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      currentBoard[randomCell.r][randomCell.c] = Math.random() < 0.9 ? 2 : 4;
    }
  };

  const hasMovesLeft = (currentBoard) => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] === 0) return true; // Empty cell
        // Check neighbors
        if (r < BOARD_SIZE - 1 && currentBoard[r][c] === currentBoard[r + 1][c]) return true;
        if (c < BOARD_SIZE - 1 && currentBoard[r][c] === currentBoard[r][c + 1]) return true;
      }
    }
    return false;
  };

  const checkGameOver = (currentBoard) => {
    if (!hasMovesLeft(currentBoard)) {
      setIsGameOver(true);
      if (score > highScore) {
        setHighScore(score);
        if (db && firebaseUser) {
            saveHighScoreToFirestore(score);
        }
      }
    }
  };

  const move = (direction) => {
    if (isGameOver) return;

    let newBoard = board.map(row => [...row]);
    let newScore = score;
    let hasMoved = false;

    // Helper functions for board manipulation
    const transpose = (b) => b[0].map((_, colIndex) => b.map(row => row[colIndex]));
    const reverse = (b) => b.map(row => [...row].reverse());
    
    // Function to slide and merge tiles to the left for a single row
    const slideLeft = (row) => {
      let filteredRow = row.filter(val => val !== 0);
      let newRow = [];
      let currentScore = 0;

      for (let i = 0; i < filteredRow.length; i++) {
        if (i + 1 < filteredRow.length && filteredRow[i] === filteredRow[i + 1]) {
          const mergedValue = filteredRow[i] * 2;
          newRow.push(mergedValue);
          currentScore += mergedValue;
          i++; // Skip the next tile as it's merged
        } else {
          newRow.push(filteredRow[i]);
        }
      }
      
      while (newRow.length < BOARD_SIZE) {
        newRow.push(0);
      }
      return { row: newRow, score: currentScore };
    };

    let initialBoard = JSON.stringify(newBoard);

    // Apply the correct transformations based on the direction
    if (direction === 'up') {
      newBoard = transpose(newBoard);
      for (let r = 0; r < BOARD_SIZE; r++) {
        const { row, score: rowScore } = slideLeft(newBoard[r]);
        newBoard[r] = row;
        newScore += rowScore;
      }
      newBoard = transpose(newBoard);
    } else if (direction === 'down') {
      newBoard = transpose(newBoard);
      newBoard = reverse(newBoard);
      for (let r = 0; r < BOARD_SIZE; r++) {
        const { row, score: rowScore } = slideLeft(newBoard[r]);
        newBoard[r] = row;
        newScore += rowScore;
      }
      newBoard = reverse(newBoard);
      newBoard = transpose(newBoard);
    } else if (direction === 'left') {
      for (let r = 0; r < BOARD_SIZE; r++) {
        const { row, score: rowScore } = slideLeft(newBoard[r]);
        newBoard[r] = row;
        newScore += rowScore;
      }
    } else if (direction === 'right') {
      newBoard = reverse(newBoard);
      for (let r = 0; r < BOARD_SIZE; r++) {
        const { row, score: rowScore } = slideLeft(newBoard[r]);
        newBoard[r] = row;
        newScore += rowScore;
      }
      newBoard = reverse(newBoard);
    }
    
    if (initialBoard !== JSON.stringify(newBoard)) {
      spawnRandomTile(newBoard);
      setBoard(newBoard);
      setScore(newScore);
      checkGameOver(newBoard);
    }
  };

  const handleKeyDown = (event) => {
    if (isModalOpen || isLeaderboardOpen) return;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        move('up');
        break;
      case 'ArrowDown':
        event.preventDefault();
        move('down');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        move('right');
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    initializeBoard();
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [board, isGameOver, score, isModalOpen, isLeaderboardOpen]);

  // Wallet Connection Logic
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
        setModalMessage('No Web3 wallet detected. Please install MetaMask or a similar wallet to connect.');
        setIsModalOpen(true);
        return;
    }
    if (typeof window.ethers === 'undefined') {
        setModalMessage('Ethers.js library not loaded. Please try again later.');
        setIsModalOpen(true);
        return;
    }
    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      setIsConnected(true);
      setModalMessage(`Wallet connected! Address: ${address.substring(0, 6)}...${address.substring(address.length - 4)}`);
      setIsModalOpen(true);
    } catch (error) {
      setModalMessage('Error connecting wallet. Please make sure a Web3 wallet like MetaMask is installed and try again.');
      setIsModalOpen(true);
    }
  };
  
  const getContract = async () => {
    if (typeof window.ethereum === 'undefined' || typeof window.ethers === 'undefined') {
      console.error("Web3 wallet or ethers library not available.");
      return null;
    }
    const provider = new window.ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    return contract;
  }

  const handleSaveScore = async () => {
    if (!isConnected || !walletAddress) {
      setModalMessage('Please connect your wallet first.');
      setIsModalOpen(true);
      return;
    }

    setSaveScoreLoading(true);

    try {
        const contract = await getContract();
        if (!contract) {
            setSaveScoreLoading(false);
            setModalMessage('Could not get contract instance.');
            setIsModalOpen(true);
            return;
        }

        const transaction = await contract.submitHighScore(score);
        await transaction.wait();

        // After the transaction is successful, save the score to Firestore for the leaderboard
        await saveHighScoreToFirestore(score);

        setSaveScoreLoading(false);
        setModalMessage(`Score of ${score} submitted successfully to the Somnia Network! Transaction Hash: ${transaction.hash}`);
        setIsModalOpen(true);

    } catch (error) {
        setSaveScoreLoading(false);
        let errorMessage = 'Error submitting score. Please check the console for details.';
        if (error.reason) {
          errorMessage = `Error: ${error.reason}`;
        } else if (error.message) {
          errorMessage = `Error: ${error.message.split('(')[0]}`;
        }
        setModalMessage(errorMessage);
        setIsModalOpen(true);
        console.error("Error saving score to network:", error);
    }
  };


  const Modal = ({ message, onClose }) => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
        <div className="bg-white p-6 rounded-2xl shadow-lg w-11/12 md:w-1/3 text-center">
          <p className="text-xl font-semibold text-gray-800">{message}</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition duration-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  const LeaderboardModal = ({ data, onClose, currentUserUid }) => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] overflow-y-auto relative">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">Leaderboard</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="text-xs text-white uppercase bg-slate-800 rounded-t-lg">
              <tr>
                <th scope="col" className="px-4 py-3 rounded-tl-lg">Rank</th>
                <th scope="col" className="px-4 py-3">Player</th>
                <th scope="col" className="px-4 py-3 rounded-tr-lg">High Score</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((entry, index) => (
                  <tr key={entry.userId} className={`border-b border-slate-700 ${entry.userId === currentUserUid ? 'bg-fuchsia-600 font-bold text-white' : 'hover:bg-slate-800'}`}>
                    <td className="px-4 py-4 font-medium">{index + 1}</td>
                    <td className="px-4 py-4">{entry.username}</td>
                    <td className="px-4 py-4">{entry.highScore}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-4 py-4 text-center">No scores yet! Be the first to play.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };


  const GameTile = ({ value }) => {
    const size = 'w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28';
    return (
      <div className={`relative ${size} flex items-center justify-center rounded-lg ${tileColors[0]} transition-all duration-200`}>
        {value !== 0 && (
          <div className={getTileClassName(value)}>
            {value}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-800 text-white font-sans flex flex-col items-center justify-center p-4">
      <header className="text-center mb-8">
        <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500 mb-2">2048 - Somnia Edition</h1>
        <p className="text-sm text-slate-400">Merge the tiles to get to 2048! Powered by Somnia Network.</p>
      </header>

      <div className="bg-slate-900 p-6 rounded-2xl shadow-xl border-2 border-slate-700 max-w-lg w-full">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col items-start">
            <span className="text-lg font-bold text-slate-300">Score</span>
            <span className="text-4xl font-extrabold text-white">{score}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-lg font-bold text-slate-300">High Score</span>
            <span className="text-4xl font-extrabold text-white">{highScore}</span>
          </div>
        </div>

        {isGameOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 bg-opacity-80 rounded-2xl">
            <div className="text-center">
              <h2 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-500 animate-pulse">Game Over!</h2>
              <button
                onClick={initializeBoard}
                className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg transition transform hover:scale-105 hover:bg-blue-700 flex items-center mx-auto"
              >
                <RefreshCcw className="mr-2" size={20} /> New Game
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 md:gap-3 bg-slate-700 p-3 rounded-xl relative">
          {board.flat().map((value, index) => (
            <GameTile key={index} value={value} />
          ))}
        </div>

        <div className="flex flex-col items-center justify-between mt-6 space-y-4">
          <div className="w-full flex justify-center space-x-4">
            <button
              onClick={initializeBoard}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg transition transform hover:scale-105 hover:bg-blue-700"
            >
              <RefreshCcw className="mr-2" size={20} /> New Game
            </button>
            <button
              onClick={() => setIsLeaderboardOpen(true)}
              className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg transition transform hover:scale-105 hover:bg-indigo-700"
            >
              <Trophy className="mr-2" size={20} /> Leaderboard
            </button>
          </div>
          
          <div className="w-full mt-4">
              <label htmlFor="username" className="block text-sm font-medium text-slate-300">
                Your Player Name:
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-full border-slate-700 bg-slate-700 text-white shadow-sm p-2 focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-center"
              />
            </div>
          <div className="w-full flex justify-center space-x-4">
            <button
              onClick={connectWallet}
              className={`flex items-center px-6 py-3 rounded-full font-bold shadow-lg transition transform hover:scale-105 ${
                isConnected ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-fuchsia-600 text-white hover:bg-fuchsia-700'
              }`}
            >
              <Wallet className="mr-2" size={20} />
              {isConnected ? 'Connected' : 'Connect Wallet'}
            </button>
          </div>

          {isConnected && (
            <div className="w-full text-center">
              <p className="text-sm text-slate-400">
                Connected to Somnia Network as: <span className="font-mono text-white">{walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}</span>
              </p>
              <button
                onClick={handleSaveScore}
                disabled={saveScoreLoading}
                className="mt-2 px-6 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg transition transform hover:scale-105 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveScoreLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Save Score to Network'}
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-8 text-center text-sm text-slate-400">
        <p className="mb-2">
          Use the <span className="font-bold text-white">arrow keys</span> to move the tiles.
        </p>
        <div className="flex items-center justify-center space-x-2">
          <ArrowUp className="text-white" />
          <ArrowDown className="text-white" />
          <ArrowLeft className="text-white" />
          <ArrowRight className="text-white" />
        </div>
        <div className="mt-4">
          <h3 className="text-lg font-bold text-white">Somnia Network Details:</h3>
          <p>Chain ID: 50312</p>
          <p>Symbol: STT</p>
          <p>RPC: https://dream-rpc.somnia.network/</p>
        </div>
      </footer>
      {isModalOpen && <Modal message={modalMessage} onClose={() => setIsModalOpen(false)} />}
      {isLeaderboardOpen && <LeaderboardModal data={leaderboardData} onClose={() => setIsLeaderboardOpen(false)} currentUserUid={firebaseUser?.uid} />}
    </div>
  );
};

export default App;

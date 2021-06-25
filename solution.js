/*
Get list of words from https://raw.githubusercontent.com/despo/hangman/master/words
Initialize the game using POST request
Check the hagman string length
Filter out words having same length as hangman string
Find the frequency of letters in the filtered word list
Choose the most frequent letter as first guess
Send PUT request on /hangman to check the letter and put the letter in already tried letter
If guess is correct, filter the list of words having correct letters at same position
If guess is not correct, filter out all words with wrong letter
Guess next letter using same probability logic
Check number of tries, if 7 wrong tries, then print game over
If there are no more underscores, then declare a win
 */

const axios = require('axios');

const WORDS_URI = 'https://raw.githubusercontent.com/despo/hangman/master/words';
const HANGMAN_API_URI = 'http://hangman-api.herokuapp.com/hangman';

const getWords = async () => {
    const response = await axios.get(WORDS_URI, { responseType: 'text' });
    return response.data.split('\n');
};

const filterWords = (words, length, exclude, include) => {

  const filtered = words.filter(w => w.length === length)
    .filter(w => !exclude.some(e => w.includes(e)));

  if(include) {
    return filtered.filter(w => {
      const mustIncludeLetters = Object.keys(include);
      return mustIncludeLetters.every(l => w.charAt(include[l]) == l);
    });
  }

  return filtered;
}

const frequency = (word) =>
    Array.from(word).reduce((acc, curr) => ({
        ...acc,
        [curr]: (acc[curr] || 0) + 1
    }), {});

const merge = (frequencyMaps) => {
    const keys = frequencyMaps.reduce((keys, map) => {
        Object.keys(map).forEach(k => keys.add(k));
        return keys;
    }, new Set());
    // loop over all keys and collect frequencies for each key in every map and sum them
    let merged = {};
    for(let k of keys) {
        const frequencies = frequencyMaps.map(m => m[k] || 0);
        merged = {
            ...merged,
            [k]: frequencies.reduce((sum, x) => sum + x)
        }
    }
    return merged;
}

class AlreadyTriedLetter extends Error {

}

const checkGuess = async (letter, token) => {
    const response = await axios({
      method: 'PUT',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      url: HANGMAN_API_URI,
      data: `letter=${letter}&token=${token}`
    });

    if(response.status == 304) {
      throw new AlreadyTriedLetter();
    }
    return response.data;
}

const startGame = () => axios({
    method: 'POST',
    url: HANGMAN_API_URI
}).then(res => res.data);

const isWin = (hangmanStr) => !hangmanStr.includes('_');

const max = (frequencies) => {
    const sorted = Object.keys(frequencies).sort((a,b) => frequencies[b] - frequencies[a]);
    return sorted[0];
}

const chooseLetter = (words, exclude) => {
    const frequencies = merge(words.map(word => frequency(word)));
    exclude.forEach(letter => {
      frequencies[letter] = 0;
    });
    return max(frequencies);
}

(async() => {
    const words = await getWords();
    let wrongGuesses = [];
    let correctGuesses = {};
    console.log('Starting Hangman Game...');
    const { hangman, token } = await startGame();

    const wordLength = hangman.length;
    console.log(`Word Length: ${wordLength}`);

    while(wrongGuesses.length < 7) {
      let filteredWords = filterWords(words, wordLength, wrongGuesses, correctGuesses);

      console.log('Choosing letter ...');
      const letter = chooseLetter(filteredWords, [ ...wrongGuesses, ...Object.keys(correctGuesses) ]);
      console.log(`Letter is ${letter}, Checking...`);

      try {
        const {correct, hangman: newHangman } = await checkGuess(letter, token);

        if(correct) {
          console.log(`Guess was correct!`);

          const selectedWord = filteredWords.find(w => w.indexOf(letter) > -1);
          correctGuesses = {
            ...correctGuesses,
            [letter]: selectedWord.indexOf(letter), // pick the first word from filtered words having chosen letter
          };

          filteredWords = filterWords(filteredWords, wordLength, wrongGuesses, correctGuesses);

          if(isWin(newHangman)) {
            console.log('You Won!');
            break;
          }

        } else {
          console.log(`Guess was wrong!`);
          wrongGuesses = wrongGuesses.concat(letter);
          filteredWords = filterWords(filteredWords, wordLength, wrongGuesses, correctGuesses);
          if(wrongGuesses.length == 7) {
            console.log('Max allowed guesses reached! Exiting game...')
            break;
          }
        }

      } catch(err) {
        if(err instanceof AlreadyTriedLetter) {
          console.log('Already tried');
        }
      }

    }

    if(wrongGuesses.length == 7) {
      console.log('You Lost!');
    } else {
      console.log('You Won!');
    }

})();

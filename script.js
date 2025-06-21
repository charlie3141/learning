// Global Firebase variables (will be initialized after DOMContentLoaded)
let db;
let auth;
let userId = null; // Stores the current user's ID
let isAuthReady = false; // Flag to indicate Firebase auth is ready

// Global variables for game state
let allLessons = []; // Stores all loaded lessons: [{title, vocab, filename, playCount}]
let currentLesson = null; // Stores the currently selected lesson object {title, vocab, filename, playCount}
let vocabulary = []; // Stores all word-meaning pairs for the current lesson

let selectedEnglishCard = null;    // Stores the currently selected English card element
let selectedVietnameseCard = null; // Stores the currently selected Vietnamese card element

let score = 0;       // Number of correct matches for the current lesson
let attempts = 0;    // Total attempts made (successful or not) for the current lesson
let matchesFound = 0; // Tracks how many pairs have been successfully matched in current lesson

// DOM elements
const mainTitleElement = document.getElementById('main-title');
const userIdSpan = document.getElementById('user-id-span');
const lessonSelectionArea = document.getElementById('lesson-selection-area');
const lessonsListContainer = document.getElementById('lessons-list');
const loadingLessonsMessage = document.getElementById('loading-lessons-message');
const gameContainer = document.getElementById('game-container');
const englishWordsContainer = document.getElementById('english-words');
const vietnameseMeaningsContainer = document.getElementById('vietnamese-meanings');
const feedbackMessageElement = document.getElementById('feedback-message');
const scoreDisplayElement = document.getElementById('score-display');
const resetButton = document.getElementById('reset-button');
const backToLessonsButton = document.getElementById('back-to-lessons-button');


// Feedback messages for correct and incorrect attempts
const correctFeedback = [
    "Excellent!", "You got it!", "Fantastic work!", "Bravo!",
    "Perfect match!", "Superb!", "Nailed it!", "Brilliant!"
];

const incorrectFeedback = [
    "Oops, not quite! Keep trying!", "Almost there, give it another shot!",
    "Don't worry, you'll get it!", "That's not it, but you're learning!",
    "Try again, you can do it!", "A little off, keep practicing!",
    "Keep pushing, you'll find it!", "Not the one, but every try helps!"
];

/**
 * Initializes Firebase Authentication and Firestore.
 * Sets up an auth state listener to get the user ID.
 */
async function initializeFirebase() {
    console.log("initializeFirebase: Starting Firebase initialization...");
    let firebaseConfig = {};

    // Get __app_id and __firebase_config from the Canvas environment
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    console.log("initializeFirebase: __app_id is:", appId);

    try {
        if (typeof __firebase_config !== 'undefined' && __firebase_config) {
            firebaseConfig = JSON.parse(__firebase_config);
            console.log("initializeFirebase: __firebase_config parsed successfully.");
            // console.log("initializeFirebase: Firebase Config:", firebaseConfig); // Log for debugging, but be cautious with sensitive info
        } else {
            console.warn("initializeFirebase: __firebase_config is undefined or empty. Using empty config.");
        }
    } catch (e) {
        console.error("initializeFirebase: Error parsing __firebase_config:", e);
        feedbackMessageElement.textContent = 'Configuration error: Could not parse Firebase settings.';
        loadingLessonsMessage.textContent = 'Configuration error: Could not parse Firebase settings.';
        feedbackMessageElement.classList.add('incorrect');
        return; // Stop initialization if config is bad
    }


    if (!window.firebase) {
        console.error("initializeFirebase: Firebase SDK not loaded. Check script type='module' in index.html.");
        feedbackMessageElement.textContent = 'Firebase SDK failed to load.';
        loadingLessonsMessage.textContent = 'Firebase SDK failed to load.';
        feedbackMessageElement.classList.add('incorrect');
        return;
    }

    try {
        const app = window.firebase.initializeApp(firebaseConfig);
        db = window.firebase.getFirestore(app);
        auth = window.firebase.getAuth(app);
        console.log("initializeFirebase: Firebase app, db, auth initialized.");

        // Listen for authentication state changes
        window.firebase.onAuthStateChanged(auth, async (user) => {
            console.log("onAuthStateChanged: Auth state changed. User:", user ? user.uid : "null (anonymous sign-in attempt)");
            if (user) {
                // User is signed in
                userId = user.uid;
                userIdSpan.textContent = userId;
                console.log("onAuthStateChanged: Firebase Auth Ready. User ID:", userId);
            } else {
                // User is signed out or not authenticated. Sign in anonymously.
                try {
                    // Use __initial_auth_token if provided, otherwise sign in anonymously
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await window.firebase.signInWithCustomToken(auth, __initial_auth_token);
                        console.log("onAuthStateChanged: Signed in with custom token.");
                    } else {
                        await window.firebase.signInAnonymously(auth);
                        console.log("onAuthStateChanged: Signed in anonymously.");
                    }
                    userId = auth.currentUser?.uid || crypto.randomUUID(); // Fallback for anonymous
                    userIdSpan.textContent = userId;
                    console.log("onAuthStateChanged: Firebase Auth Ready. User ID (after anonymous/custom sign-in):", userId);
                } catch (anonError) {
                    console.error("onAuthStateChanged: Error signing in anonymously/custom token:", anonError);
                    userIdSpan.textContent = "Error";
                    feedbackMessageElement.textContent = `Authentication error: ${anonError.message}`;
                    loadingLessonsMessage.textContent = `Authentication error: ${anonError.message}`;
                    feedbackMessageElement.classList.add('incorrect');
                }
            }
            isAuthReady = true;
            console.log("onAuthStateChanged: isAuthReady set to true. Calling loadAllLessons.");
            // Once auth is ready, load all lessons and their play counts
            await loadAllLessons();
        });
    } catch (error) {
        console.error("initializeFirebase: Error initializing Firebase app or services:", error);
        feedbackMessageElement.textContent = 'Failed to initialize application services.';
        loadingLessonsMessage.textContent = 'Failed to initialize application services.';
        feedbackMessageElement.classList.add('incorrect');
    }
}

/**
 * Fetches lesson data from 'wordN.txt' files sequentially.
 * Parses each file, extracts the title (first line), and vocabulary.
 */
async function loadAllLessons() {
    console.log("loadAllLessons: Starting lesson loading process.");
    lessonsListContainer.innerHTML = ''; // Clear previous lesson list
    loadingLessonsMessage.textContent = 'Loading lessons...';
    loadingLessonsMessage.style.display = 'block'; // Show loading message

    allLessons = []; // Reset lessons array
    let lessonIndex = 1;
    let foundLessons = false;

    while (true) {
        const filename = `word${lessonIndex}.txt`;
        console.log(`loadAllLessons: Attempting to fetch ${filename}`);
        try {
            const response = await fetch(filename);

            if (!response.ok) {
                // If 404 Not Found, assume no more lesson files
                if (response.status === 404) {
                    console.log(`loadAllLessons: No more lesson files found after ${filename} (404). Breaking loop.`);
                    break;
                } else {
                    throw new Error(`HTTP error! Status: ${response.status} for ${filename}`);
                }
            }

            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');
            console.log(`loadAllLessons: Successfully fetched ${filename}. Lines count: ${lines.length}`);


            if (lines.length === 0) {
                console.warn(`loadAllLessons: Skipping empty lesson file: ${filename}`);
                lessonIndex++;
                continue;
            }

            const title = lines[0].trim(); // First line is the title
            const vocab = lines.slice(1).map((line, index) => {
                const parts = line.split(' - ');
                if (parts.length === 2) {
                    return {
                        english: parts[0].trim(),
                        vietnam: parts[1].trim(),
                        id: `${filename}-word-${index}` // Unique ID for matching
                    };
                }
                console.warn(`loadAllLessons: Skipping malformed vocabulary line in ${filename}: ${line}`);
                return null;
            }).filter(item => item !== null); // Filter out malformed vocabulary entries

            if (vocab.length > 0) {
                allLessons.push({
                    title: title,
                    vocab: vocab,
                    filename: filename,
                    playCount: 0 // Will be updated from Firestore
                });
                foundLessons = true;
                console.log(`loadAllLessons: Added lesson "${title}" from ${filename} with ${vocab.length} words.`);
            } else {
                console.warn(`loadAllLessons: Lesson file ${filename} contains only a title or no valid vocabulary.`);
            }

            lessonIndex++;
        } catch (error) {
            console.error(`loadAllLessons: Error fetching lesson ${filename}:`, error);
            // Stop if there's a serious network error or other issue
            lessonsListContainer.textContent = `Error loading lessons: ${error.message}`;
            loadingLessonsMessage.style.display = 'none'; // Hide loading message
            break; // Stop trying to fetch more files on error
        }
    }

    loadingLessonsMessage.style.display = 'none'; // Hide loading message
    console.log(`loadAllLessons: Finished fetching lessons. Found ${allLessons.length} lessons. `);

    if (foundLessons) {
        console.log("loadAllLessons: Found lessons. Calling getLessonPlayCounts.");
        await getLessonPlayCounts(); // Fetch play counts from Firestore after loading all lessons
        // displayLessonSelection() is called inside getLessonPlayCounts now
    } else {
        lessonsListContainer.textContent = 'No lessons found. Please ensure wordN.txt files exist and are correctly formatted.';
        console.log("loadAllLessons: No lessons found. Displaying message.");
    }
}

/**
 * Fetches existing lesson play counts from Firestore for the current user.
 * Merges these counts into the `allLessons` array.
 */
async function getLessonPlayCounts() {
    console.log("getLessonPlayCounts: Attempting to fetch play counts.");
    if (!isAuthReady || !userId || !db) {
        console.warn("getLessonPlayCounts: Firebase not ready or user ID not available to fetch play counts. isAuthReady:", isAuthReady, "userId:", userId, "db:", db);
        displayLessonSelection(); // Still try to display lessons even if counts can't be fetched
        return;
    }
    // Define the path to the user's private lesson progress collection
    // Ensure __app_id is correctly defined for the Firestore path
    const lessonProgressRef = window.firebase.collection(db, `artifacts/${appId}/users/${userId}/lesson_progress`);
    try {
        const querySnapshot = await window.firebase.getDocs(lessonProgressRef);
        const playCountsMap = new Map();
        querySnapshot.forEach(doc => {
            playCountsMap.set(doc.id, doc.data().playCount || 0); // doc.id is the filename
        });
        console.log("getLessonPlayCounts: Fetched play counts:", playCountsMap);

        // Update allLessons with fetched play counts
        allLessons.forEach(lesson => {
            lesson.playCount = playCountsMap.has(lesson.filename) ? playCountsMap.get(lesson.filename) : 0;
        });
        console.log("getLessonPlayCounts: Updated allLessons with play counts.");
        displayLessonSelection(); // Re-display lesson selection to show updated counts
    } catch (error) {
        console.error("getLessonPlayCounts: Error fetching lesson play counts:", error);
        feedbackMessageElement.textContent = 'Could not load your lesson progress.';
        displayLessonSelection(); // Display lessons even if counts failed to load
    }
}

/**
 * Updates the play count for a specific lesson in Firestore.
 * @param {string} filename The filename of the lesson (used as document ID).
 */
async function updateLessonPlayCount(filename) {
    console.log("updateLessonPlayCount: Attempting to update play count for:", filename);
    if (!isAuthReady || !userId || !db) {
        console.warn("updateLessonPlayCount: Firebase not ready or user ID not available to update play count.");
        return;
    }
    // Ensure __app_id is correctly defined for the Firestore path
    const lessonDocRef = window.firebase.doc(db, `artifacts/${appId}/users/${userId}/lesson_progress`, filename);
    try {
        const docSnap = await window.firebase.getDoc(lessonDocRef);
        if (docSnap.exists()) {
            const currentCount = docSnap.data().playCount || 0;
            await window.firebase.updateDoc(lessonDocRef, { playCount: currentCount + 1 });
            console.log(`updateLessonPlayCount: Updated play count for ${filename} to ${currentCount + 1}`);
        } else {
            await window.firebase.setDoc(lessonDocRef, { playCount: 1 });
            console.log(`updateLessonPlayCount: Initialized play count for ${filename} to 1`);
        }
        // Update local lesson data immediately
        const lessonToUpdate = allLessons.find(lesson => lesson.filename === filename);
        if (lessonToUpdate) {
            lessonToUpdate.playCount = (lessonToUpdate.playCount || 0) + 1;
            // No need to call displayLessonSelection here if the user is still in game
            // The counts will be reloaded and displayed when they go back to the lesson list.
        }
    } catch (error) {
        console.error("updateLessonPlayCount: Error updating lesson play count:", error);
        feedbackMessageElement.textContent = 'Could not save lesson progress.';
    }
}

/**
 * Displays the lesson selection screen and populates it with available lessons.
 */
function displayLessonSelection() {
    console.log("displayLessonSelection: Showing lesson selection UI.");
    mainTitleElement.textContent = 'Vocabulary Matcher'; // Reset main title
    lessonSelectionArea.classList.remove('hidden');
    gameContainer.classList.add('hidden'); // Ensure game container is hidden
    lessonsListContainer.innerHTML = ''; // Clear existing lesson cards

    if (allLessons.length === 0) {
        lessonsListContainer.textContent = 'No lessons available.';
        console.log("displayLessonSelection: No lessons in allLessons array.");
        return;
    }

    allLessons.forEach(lesson => {
        const lessonCard = document.createElement('div');
        lessonCard.classList.add('lesson-card');
        lessonCard.innerHTML = `
            <h3>${lesson.title}</h3>
            <p>Played: ${lesson.playCount || 0} times</p>
        `;
        lessonCard.addEventListener('click', () => startLesson(lesson));
        lessonsListContainer.appendChild(lessonCard);
    });
    console.log(`displayLessonSelection: Rendered ${allLessons.length} lesson cards.`);
}

/**
 * Starts a selected lesson, transitioning from lesson selection to game view.
 * @param {Object} lesson The lesson object to start.
 */
function startLesson(lesson) {
    console.log("startLesson: Starting lesson:", lesson.title);
    currentLesson = lesson;
    vocabulary = lesson.vocab; // Set global vocabulary to the selected lesson's vocab

    mainTitleElement.textContent = currentLesson.title; // Update main title to lesson title
    lessonSelectionArea.classList.add('hidden'); // Hide lesson selection
    gameContainer.classList.remove('hidden'); // Show game container

    initializeGame(); // Initialize the game for the selected lesson
}


/**
 * Shuffles an array randomly using the Fisher-Yates algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}

/**
 * Creates and returns a card HTML element.
 * @param {string} text The text to display on the card.
 * @param {'english'|'vietnamese'} type The type of card (for styling).
 * @param {string} dataId The unique ID to associate with the card for matching.
 * @returns {HTMLElement} The created card div element.
 */
function createCard(text, type, dataId) {
    const card = document.createElement('div');
    card.classList.add('card', type);
    card.textContent = text;
    card.dataset.id = dataId; // Store the matching ID in a data attribute
    card.addEventListener('click', handleCardClick); // Add click listener
    return card;
}

/**
 * Renders the shuffled English words and Vietnamese meanings to the DOM.
 */
function renderCards() {
    console.log("renderCards: Rendering new set of cards.");
    // Clear previous cards
    englishWordsContainer.innerHTML = '<h2>English Words</h2>';
    vietnameseMeaningsContainer.innerHTML = '<h2>Vietnamese Meanings</h2>';

    // Shuffle vocabulary items for both lists independently
    // Create new arrays of just the English words and Vietnamese meanings with their IDs
    const englishWordCards = shuffleArray(vocabulary.map(item => ({ text: item.english, id: item.id })));
    const vietnameseMeaningCards = shuffleArray(vocabulary.map(item => ({ text: item.vietnam, id: item.id })));

    // Append English word cards
    englishWordCards.forEach(word => {
        englishWordsContainer.appendChild(createCard(word.text, 'english', word.id));
    });

    // Append Vietnamese meaning cards
    vietnameseMeaningCards.forEach(meaning => {
        vietnameseMeaningsContainer.appendChild(createCard(meaning.text, 'vietnamese', meaning.id));
    });
    console.log(`renderCards: Rendered ${vocabulary.length} English and ${vocabulary.length} Vietnamese cards.`);
}

/**
 * Handles clicks on word and meaning cards.
 * Manages selection and triggers match checking.
 * @param {Event} event The click event.
 */
function handleCardClick(event) {
    const clickedCard = event.target;
    console.log("handleCardClick: Card clicked:", clickedCard.textContent, clickedCard.dataset.id);

    // Do nothing if the card is already matched or is not a card element
    if (clickedCard.classList.contains('matched') || !clickedCard.classList.contains('card')) {
        console.log("handleCardClick: Card already matched or not a valid card. Ignoring click.");
        return;
    }

    // Determine if it's an English or Vietnamese card
    if (clickedCard.classList.contains('english')) {
        // Deselect previously selected English card if any
        if (selectedEnglishCard) {
            selectedEnglishCard.classList.remove('selected');
        }
        selectedEnglishCard = clickedCard;
        console.log("handleCardClick: English card selected:", selectedEnglishCard.textContent);
    } else if (clickedCard.classList.contains('vietnamese')) {
        // Deselect previously selected Vietnamese card if any
        if (selectedVietnameseCard) {
            selectedVietnameseCard.classList.remove('selected');
        }
        selectedVietnameseCard = clickedCard;
        console.log("handleCardClick: Vietnamese card selected:", selectedVietnameseCard.textContent);
    }

    clickedCard.classList.add('selected'); // Mark the clicked card as selected

    // If both an English and a Vietnamese card are selected, check for a match
    if (selectedEnglishCard && selectedVietnameseCard) {
        console.log("handleCardClick: Both cards selected. Checking match in 500ms.");
        // Delay checking to allow visual "selected" state to register
        setTimeout(checkMatch, 500);
    }
}

/**
 * Checks if the two selected cards form a correct match.
 * Updates score, provides feedback, and handles game state.
 */
function checkMatch() {
    attempts++; // Increment total attempts
    console.log("checkMatch: Checking match. Attempt:", attempts);

    const englishId = selectedEnglishCard.dataset.id;
    const vietnameseId = selectedVietnameseCard.dataset.id;

    if (englishId === vietnameseId) {
        // Correct match!
        score++;
        matchesFound++;
        updateFeedback(getRandomFeedback('correct'), 'correct');
        console.log(`checkMatch: Correct match! ${selectedEnglishCard.textContent} - ${selectedVietnameseCard.textContent}. Matches found: ${matchesFound}/${vocabulary.length}`);


        // Mark cards as matched and disable them
        selectedEnglishCard.classList.remove('selected');
        selectedVietnameseCard.classList.remove('selected');
        selectedEnglishCard.classList.add('matched');
        selectedVietnameseCard.classList.add('matched');

        // Reset selections
        selectedEnglishCard = null;
        selectedVietnameseCard = null;

        updateScoreDisplay();

        // Check if all words have been matched
        if (matchesFound === vocabulary.length) {
            console.log("checkMatch: All words matched! Game completed.");
            setTimeout(() => {
                feedbackMessageElement.textContent = `🎉 Congratulations! You matched all ${vocabulary.length} words in ${attempts} attempts!`;
                feedbackMessageElement.classList.remove('correct', 'incorrect');
                feedbackMessageElement.classList.add('correct'); // Use correct style for celebration

                // Update the lesson play count in Firestore
                if (currentLesson) {
                    updateLessonPlayCount(currentLesson.filename);
                }
            }, 700); // Delay celebratory message slightly
        }

    } else {
        // Incorrect match
        updateFeedback(getRandomFeedback('incorrect'), 'incorrect');
        console.log(`checkMatch: Incorrect match. ${selectedEnglishCard.textContent} - ${selectedVietnameseCard.textContent}`);

        // Briefly show the incorrect selection, then deselect
        setTimeout(() => {
            if (selectedEnglishCard) selectedEnglishCard.classList.remove('selected');
            if (selectedVietnameseCard) selectedVietnameseCard.classList.remove('selected');
            selectedEnglishCard = null;
            selectedVietnameseCard = null;
            console.log("checkMatch: Incorrect cards deselected.");
        }, 800); // Keep selected state for a moment before resetting
    }
}

/**
 * Updates the feedback message displayed on the screen.
 * @param {string} message The message to display.
 * @param {'correct'|'incorrect'|''} type The type of feedback for styling.
 */
function updateFeedback(message, type) {
    // Clear previous feedback classes
    feedbackMessageElement.classList.remove('correct', 'incorrect');
    feedbackMessageElement.textContent = message;
    if (type) {
        feedbackMessageElement.classList.add(type);
    }
}

/**
 * Gets a random feedback message from the specified type array.
 * @param {'correct'|'incorrect'} type
 * @returns {string} A random feedback message.
 */
function getRandomFeedback(type) {
    const feedbackArray = type === 'correct' ? correctFeedback : incorrectFeedback;
    return feedbackArray[Math.floor(Math.random() * feedbackArray.length)];
}

/**
 * Updates the score display.
 */
function updateScoreDisplay() {
    scoreDisplayElement.textContent = `Score: ${score} / ${vocabulary.length} (Attempts: ${attempts})`;
    console.log("updateScoreDisplay: Score updated.");
}

/**
 * Resets the game state for the current lesson and starts a new round.
 */
function initializeGame() {
    console.log("initializeGame: Resetting game state for new round.");
    score = 0;
    attempts = 0;
    matchesFound = 0;
    selectedEnglishCard = null;
    selectedVietnameseCard = null;
    updateFeedback('Match the words!', ''); // Initial neutral feedback
    updateScoreDisplay();
    renderCards(); // Re-render cards for a new round
}

// Event listeners for buttons
resetButton.addEventListener('click', initializeGame);
backToLessonsButton.addEventListener('click', () => {
    console.log("Back to Lessons button clicked.");
    displayLessonSelection();
});

// Initial call to initialize Firebase and load lessons when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded: DOM fully loaded. Initializing Firebase.");
    initializeFirebase();
});

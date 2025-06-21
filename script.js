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
    // These global variables are provided by the Canvas environment.
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

    if (!window.firebase) {
        console.error("Firebase SDK not loaded. Check script type='module' in index.html.");
        feedbackMessageElement.textContent = 'Firebase SDK failed to load.';
        return;
    }

    try {
        const app = window.firebase.initializeApp(firebaseConfig);
        db = window.firebase.getFirestore(app);
        auth = window.firebase.getAuth(app);

        // Listen for authentication state changes
        window.firebase.onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in
                userId = user.uid;
                userIdSpan.textContent = userId;
                console.log("Firebase Auth Ready. User ID:", userId);
            } else {
                // User is signed out or not authenticated. Sign in anonymously.
                try {
                    // Use __initial_auth_token if provided, otherwise sign in anonymously
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await window.firebase.signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await window.firebase.signInAnonymously(auth);
                    }
                    userId = auth.currentUser?.uid || crypto.randomUUID(); // Fallback for anonymous
                    userIdSpan.textContent = userId;
                    console.log("Firebase Auth Ready. Anonymous User ID:", userId);
                } catch (anonError) {
                    console.error("Error signing in anonymously:", anonError);
                    userIdSpan.textContent = "Error";
                }
            }
            isAuthReady = true;
            // Once auth is ready, load all lessons and their play counts
            await loadAllLessons();
        });
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        feedbackMessageElement.textContent = 'Failed to initialize application services.';
        feedbackMessageElement.classList.add('incorrect');
        loadingLessonsMessage.textContent = 'Failed to load lessons due to an application error.';
    }
}

/**
 * Fetches lesson data from 'wordN.txt' files sequentially.
 * Parses each file, extracts the title (first line), and vocabulary.
 */
async function loadAllLessons() {
    lessonsListContainer.innerHTML = ''; // Clear previous lesson list
    loadingLessonsMessage.textContent = 'Loading lessons...';
    loadingLessonsMessage.style.display = 'block'; // Show loading message

    allLessons = []; // Reset lessons array
    let lessonIndex = 1;
    let foundLessons = false;

    while (true) {
        const filename = `word${lessonIndex}.txt`;
        try {
            const response = await fetch(filename);

            if (!response.ok) {
                // If 404 Not Found, assume no more lesson files
                if (response.status === 404) {
                    console.log(`No more lesson files found after ${filename}`);
                    break;
                } else {
                    throw new Error(`HTTP error! Status: ${response.status} for ${filename}`);
                }
            }

            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');

            if (lines.length === 0) {
                console.warn(`Skipping empty lesson file: ${filename}`);
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
                console.warn(`Skipping malformed vocabulary line in ${filename}: ${line}`);
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
            } else {
                console.warn(`Lesson file ${filename} contains only a title or no valid vocabulary.`);
            }

            lessonIndex++;
        } catch (error) {
            console.error(`Error fetching lesson ${filename}:`, error);
            // Stop if there's a serious network error or other issue
            break;
        }
    }

    loadingLessonsMessage.style.display = 'none'; // Hide loading message

    if (foundLessons) {
        await getLessonPlayCounts(); // Fetch play counts from Firestore after loading all lessons
        displayLessonSelection(); // Show the lesson selection UI
    } else {
        lessonsListContainer.textContent = 'No lessons found. Please ensure wordN.txt files exist.';
    }
}

/**
 * Fetches existing lesson play counts from Firestore for the current user.
 * Merges these counts into the `allLessons` array.
 */
async function getLessonPlayCounts() {
    if (!isAuthReady || !userId || !db) {
        console.warn("Firebase not ready or user ID not available to fetch play counts.");
        return;
    }
    // Define the path to the user's private lesson progress collection
    const lessonProgressRef = window.firebase.collection(db, `artifacts/${__app_id}/users/${userId}/lesson_progress`);
    try {
        const querySnapshot = await window.firebase.getDocs(lessonProgressRef);
        const playCountsMap = new Map();
        querySnapshot.forEach(doc => {
            playCountsMap.set(doc.id, doc.data().playCount || 0); // doc.id is the filename
        });

        // Update allLessons with fetched play counts
        allLessons.forEach(lesson => {
            lesson.playCount = playCountsMap.has(lesson.filename) ? playCountsMap.get(lesson.filename) : 0;
        });
        // Re-display lesson selection to show updated counts
        displayLessonSelection();
    } catch (error) {
        console.error("Error fetching lesson play counts:", error);
        feedbackMessageElement.textContent = 'Could not load your lesson progress.';
    }
}

/**
 * Updates the play count for a specific lesson in Firestore.
 * @param {string} filename The filename of the lesson (used as document ID).
 */
async function updateLessonPlayCount(filename) {
    if (!isAuthReady || !userId || !db) {
        console.warn("Firebase not ready or user ID not available to update play count.");
        return;
    }
    // Define the document reference for this specific lesson's progress
    const lessonDocRef = window.firebase.doc(db, `artifacts/${__app_id}/users/${userId}/lesson_progress`, filename);
    try {
        const docSnap = await window.firebase.getDoc(lessonDocRef);
        if (docSnap.exists()) {
            const currentCount = docSnap.data().playCount || 0;
            await window.firebase.updateDoc(lessonDocRef, { playCount: currentCount + 1 });
            console.log(`Updated play count for ${filename} to ${currentCount + 1}`);
        } else {
            await window.firebase.setDoc(lessonDocRef, { playCount: 1 });
            console.log(`Initialized play count for ${filename} to 1`);
        }
        // Update local lesson data immediately
        const lessonToUpdate = allLessons.find(lesson => lesson.filename === filename);
        if (lessonToUpdate) {
            lessonToUpdate.playCount = (lessonToUpdate.playCount || 0) + 1;
        }
    } catch (error) {
        console.error("Error updating lesson play count:", error);
        feedbackMessageElement.textContent = 'Could not save lesson progress.';
    }
}

/**
 * Displays the lesson selection screen and populates it with available lessons.
 */
function displayLessonSelection() {
    mainTitleElement.textContent = 'Vocabulary Matcher'; // Reset main title
    lessonSelectionArea.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    lessonsListContainer.innerHTML = ''; // Clear existing lesson cards

    if (allLessons.length === 0) {
        lessonsListContainer.textContent = 'No lessons available.';
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
}

/**
 * Starts a selected lesson, transitioning from lesson selection to game view.
 * @param {Object} lesson The lesson object to start.
 */
function startLesson(lesson) {
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
}

/**
 * Handles clicks on word and meaning cards.
 * Manages selection and triggers match checking.
 * @param {Event} event The click event.
 */
function handleCardClick(event) {
    const clickedCard = event.target;

    // Do nothing if the card is already matched or is not a card element
    if (clickedCard.classList.contains('matched') || !clickedCard.classList.contains('card')) {
        return;
    }

    // Determine if it's an English or Vietnamese card
    if (clickedCard.classList.contains('english')) {
        // Deselect previously selected English card if any
        if (selectedEnglishCard) {
            selectedEnglishCard.classList.remove('selected');
        }
        selectedEnglishCard = clickedCard;
    } else if (clickedCard.classList.contains('vietnamese')) {
        // Deselect previously selected Vietnamese card if any
        if (selectedVietnameseCard) {
            selectedVietnameseCard.classList.remove('selected');
        }
        selectedVietnameseCard = clickedCard;
    }

    clickedCard.classList.add('selected'); // Mark the clicked card as selected

    // If both an English and a Vietnamese card are selected, check for a match
    if (selectedEnglishCard && selectedVietnameseCard) {
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

    const englishId = selectedEnglishCard.dataset.id;
    const vietnameseId = selectedVietnameseCard.dataset.id;

    if (englishId === vietnameseId) {
        // Correct match!
        score++;
        matchesFound++;
        updateFeedback(getRandomFeedback('correct'), 'correct');

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

        // Briefly show the incorrect selection, then deselect
        setTimeout(() => {
            if (selectedEnglishCard) selectedEnglishCard.classList.remove('selected');
            if (selectedVietnameseCard) selectedVietnameseCard.classList.remove('selected');
            selectedEnglishCard = null;
            selectedVietnameseCard = null;
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
}

/**
 * Resets the game state for the current lesson and starts a new round.
 */
function initializeGame() {
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
backToLessonsButton.addEventListener('click', displayLessonSelection);

// Initial call to initialize Firebase and load lessons when the page loads
document.addEventListener('DOMContentLoaded', initializeFirebase);

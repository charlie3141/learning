class VietnameseVocabularyLearner {
  constructor() {
    // Trạng thái học tập
    this.learningState = {
      vocabularyQueue: [],
      completedWords: new Set(),
      currentWord: null,
      currentOptions: [],
      correctAnswer: "",
      totalWords: 0,
      totalAttempts: 0,
      correctAttempts: 0,
      currentPosition: 0,
      isPaused: false,
      currentLesson: null,
    }

    // Danh sách bài học
    this.lessons = []
    this.lessonStats = this.loadLessonStats()

    // Thông điệp phản hồi
    this.feedbackMessages = {
      success: [
        "🎉 Tuyệt vời! Bạn đã trả lời đúng!",
        "🌟 Xuất sắc! Tiếp tục như vậy!",
        "✨ Rất tốt! Bạn đang học rất nhanh!",
        "🎯 Chính xác! Bạn thật giỏi!",
        "🚀 Tuyệt vời! Bạn đang tiến bộ!",
        "💫 Hoàn hảo! Từ này bạn đã thuộc rồi!",
        "🏆 Tài giỏi! Cố gắng tiếp nhé!",
        "⭐ Giỏi lắm! Bạn học rất tốt!",
      ],
      error: [
        "🤔 Chưa đúng rồi! Từ này sẽ xuất hiện lại sau!",
        "💪 Gần đúng rồi! Bạn sẽ gặp lại từ này!",
        "🎯 Đừng lo! Từ này sẽ được lặp lại!",
        "🌈 Sai rồi! Hãy nhớ kỹ để lần sau đúng!",
        "🎪 Không sao! Từ này sẽ quay lại sau!",
        "🎨 Tiếp tục cố gắng! Bạn sẽ gặp lại từ này!",
        "🎭 Chưa đúng! Từ này sẽ xuất hiện lại!",
        "🎪 Đừng bỏ cuộc! Lần sau bạn sẽ đúng!",
      ],
    }

    this.initializeEventListeners()
    this.setupMobileOptimizations()
    this.loadAvailableLessons()
  }

  initializeEventListeners() {
    // File upload
    document.getElementById("file-input").addEventListener("change", (e) => {
      this.handleFileUpload(e.target.files[0])
    })

    // Navigation
    document.getElementById("back-to-lessons").addEventListener("click", () => {
      this.showLessonSelection()
    })

    document.getElementById("back-to-lessons-modal").addEventListener("click", () => {
      this.hideCompletionModal()
      this.showLessonSelection()
    })

    // Control buttons
    document.getElementById("pause-learning").addEventListener("click", () => {
      this.togglePause()
    })

    document.getElementById("restart-session").addEventListener("click", () => {
      this.restartSession()
    })

    document.getElementById("restart-learning").addEventListener("click", () => {
      this.restartSession()
      this.hideCompletionModal()
    })
  }

  setupMobileOptimizations() {
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
      viewport.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    }

    document.body.style.overscrollBehavior = "none"
    document.addEventListener("touchstart", () => {}, { passive: true })
  }

  // Lesson Management
  async loadAvailableLessons() {
    const loadingElement = document.getElementById("loading-lessons")
    const lessonsGrid = document.getElementById("lessons-grid")
    const noLessonsElement = document.getElementById("no-lessons")

    loadingElement.style.display = "block"
    lessonsGrid.style.display = "none"
    noLessonsElement.style.display = "none"

    this.lessons = []
    let lessonNumber = 1

    // Try to load lessons starting from word1.txt
    while (true) {
      try {
        const response = await fetch(`word${lessonNumber}.txt`)
        if (!response.ok) break

        const text = await response.text()
        const lesson = this.parseLessonFile(text, `word${lessonNumber}.txt`)
        
        if (lesson) {
          this.lessons.push(lesson)
          lessonNumber++
        } else {
          break
        }
      } catch (error) {
        break
      }
    }

    loadingElement.style.display = "none"

    if (this.lessons.length > 0) {
      this.renderLessons()
      lessonsGrid.style.display = "grid"
    } else {
      noLessonsElement.style.display = "block"
    }
  }

  parseLessonFile(text, filename) {
    const lines = text.split("\n").filter((line) => line.trim())
    if (lines.length < 2) return null

    const title = lines[0].trim()
    const vocabulary = []

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(" - ")
      if (parts.length === 2) {
        vocabulary.push({
          english: parts[0].trim().toLowerCase(),
          vietnamese: parts[1].trim(),
        })
      }
    }

    if (vocabulary.length === 0) return null

    return {
      filename,
      title,
      vocabulary,
      wordCount: vocabulary.length,
    }
  }

  renderLessons() {
    const lessonsGrid = document.getElementById("lessons-grid")
    lessonsGrid.innerHTML = ""

    this.lessons.forEach((lesson, index) => {
      const completionCount = this.lessonStats[lesson.filename] || 0
      const lessonCard = this.createLessonCard(lesson, completionCount, index + 1)
      lessonsGrid.appendChild(lessonCard)
    })
  }

  createLessonCard(lesson, completionCount, lessonNumber) {
    const card = document.createElement("div")
    card.className = "lesson-card"
    
    card.innerHTML = `
      <div class="lesson-header">
        <div>
          <div class="lesson-title">${lesson.title}</div>
          <div class="lesson-info">
            <span class="word-count">${lesson.wordCount} từ vựng</span>
          </div>
        </div>
        <div class="lesson-badge">Bài ${lessonNumber}</div>
      </div>
      <div class="lesson-stats">
        ${completionCount > 0 ? `<span class="completion-badge">Đã hoàn thành ${completionCount} lần</span>` : '<span style="color: #718096;">Chưa học</span>'}
      </div>
    `

    card.addEventListener("click", () => {
      this.startLesson(lesson)
    })

    return card
  }

  startLesson(lesson) {
    this.learningState.currentLesson = lesson
    this.parseVocabularyFromLesson(lesson)
    this.showLearningInterface()
    this.startLearningSession()
  }

  parseVocabularyFromLesson(lesson) {
    const vocabulary = [...lesson.vocabulary]
    this.shuffleArray(vocabulary)

    this.learningState.vocabularyQueue = vocabulary
    this.learningState.totalWords = vocabulary.length
    this.learningState.completedWords.clear()
    this.learningState.currentPosition = 0
    this.learningState.totalAttempts = 0
    this.learningState.correctAttempts = 0
  }

  async handleFileUpload(file) {
    if (!file) return

    try {
      const text = await this.readFileAsText(file)
      const lesson = this.parseLessonFile(text, file.name)
      
      if (!lesson) {
        this.showFeedback("❌ File không đúng định dạng!", "error")
        return
      }

      this.startLesson(lesson)
    } catch (error) {
      this.showFeedback("❌ Lỗi tải file!", "error")
      console.error("File loading error:", error)
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })
  }

  // UI Management
  showLessonSelection() {
    document.getElementById("lesson-selection").style.display = "flex"
    document.getElementById("progress-container").style.display = "none"
    document.getElementById("learning-interface").style.display = "none"
    document.getElementById("control-panel").style.display = "none"
    document.getElementById("back-to-lessons").style.display = "none"
    document.getElementById("word-counter").style.display = "none"
    document.getElementById("accuracy-display").style.display = "none"
  }

  showLearningInterface() {
    document.getElementById("lesson-selection").style.display = "none"
    document.getElementById("progress-container").style.display = "block"
    document.getElementById("learning-interface").style.display = "flex"
    document.getElementById("control-panel").style.display = "flex"
    document.getElementById("back-to-lessons").style.display = "block"
    document.getElementById("word-counter").style.display = "block"
    document.getElementById("accuracy-display").style.display = "block"
  }

  startLearningSession() {
    if (this.learningState.vocabularyQueue.length === 0) {
      this.showFeedback("📝 Không có từ vựng để học!", "error")
      return
    }

    // Update lesson info
    const currentLesson = this.learningState.currentLesson
    const completionCount = this.lessonStats[currentLesson.filename] || 0
    
    document.getElementById("current-lesson-title").textContent = currentLesson.title
    document.getElementById("lesson-completion-count").textContent = `Lần thứ ${completionCount + 1}`

    this.updateAllDisplays()
    this.presentNextWord()
  }

  presentNextWord() {
    if (this.learningState.isPaused) return

    if (this.learningState.vocabularyQueue.length === 0) {
      this.completeLesson()
      return
    }

    this.learningState.currentWord = this.learningState.vocabularyQueue[0]
    this.learningState.currentPosition = this.learningState.totalWords - this.learningState.vocabularyQueue.length + 1

    this.generateOptionsWithDistractors(this.learningState.currentWord)
    this.renderWordPresentation()
    this.updateAllDisplays()
  }

  generateOptionsWithDistractors(correctWord) {
    const options = [correctWord.vietnamese]
    const allVocabulary = [...this.learningState.vocabularyQueue, ...Array.from(this.learningState.completedWords)]
    const otherWords = allVocabulary.filter((word) => word.english !== correctWord.english)
    const shuffledOthers = [...otherWords].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < 5 && i < shuffledOthers.length; i++) {
      options.push(shuffledOthers[i].vietnamese)
    }

    this.shuffleArray(options)
    this.learningState.currentOptions = options
    this.learningState.correctAnswer = correctWord.vietnamese
  }

  renderWordPresentation() {
    const word = this.learningState.currentWord

    document.getElementById("target-word").textContent = word.english.toUpperCase()

    const wordType = document.getElementById("word-type")
    const isRetry = Array.from(this.learningState.completedWords).some((w) => w.english === word.english)

    if (isRetry) {
      wordType.textContent = "Lặp lại"
      wordType.style.background = "linear-gradient(45deg, #ff9800, #f57c00)"
    } else {
      wordType.textContent = "Từ mới"
      wordType.style.background = "linear-gradient(45deg, #667eea, #764ba2)"
    }

    const optionsGrid = document.getElementById("options-grid")
    optionsGrid.innerHTML = ""

    this.learningState.currentOptions.forEach((option) => {
      const optionCard = document.createElement("div")
      optionCard.className = "option-card"
      optionCard.textContent = option

      optionCard.addEventListener(
        "touchstart",
        () => {
          if (navigator.vibrate) {
            navigator.vibrate(10)
          }
        },
        { passive: true },
      )

      optionCard.addEventListener("click", () => this.handleOptionSelection(option, optionCard))
      optionsGrid.appendChild(optionCard)
    })
  }

  handleOptionSelection(selectedOption, optionElement) {
    const isCorrect = selectedOption === this.learningState.correctAnswer

    document.querySelectorAll(".option-card").forEach((card) => {
      card.classList.add("disabled")
    })

    optionElement.classList.add(isCorrect ? "correct" : "incorrect")

    if (navigator.vibrate) {
      if (isCorrect) {
        navigator.vibrate([50, 50, 50])
      } else {
        navigator.vibrate(200)
      }
    }

    this.learningState.totalAttempts++

    if (isCorrect) {
      this.handleCorrectAnswer()
    } else {
      this.handleIncorrectAnswer()
    }

    setTimeout(() => {
      this.presentNextWord()
    }, 1500)
  }

  handleCorrectAnswer() {
    const currentWord = this.learningState.currentWord
    this.learningState.correctAttempts++
    this.learningState.vocabularyQueue.shift()
    this.learningState.completedWords.add(currentWord)
    this.showFeedback(this.getRandomMessage("success"), "success")
  }

  handleIncorrectAnswer() {
    const currentWord = this.learningState.currentWord
    this.learningState.vocabularyQueue.shift()
    this.learningState.vocabularyQueue.push(currentWord)
    this.showFeedback(this.getRandomMessage("error"), "error", `Đáp án đúng: "${this.learningState.correctAnswer}"`)
  }

  showFeedback(message, type, correctAnswer = "") {
    const feedbackElement = document.getElementById("feedback-message")
    const correctAnswerElement = document.getElementById("correct-answer")

    feedbackElement.textContent = message
    feedbackElement.className = `feedback-message ${type}`
    correctAnswerElement.textContent = correctAnswer

    setTimeout(() => {
      feedbackElement.textContent = ""
      feedbackElement.className = "feedback-message"
      correctAnswerElement.textContent = ""
    }, 1500)
  }

  updateAllDisplays() {
    this.updateHeaderStats()
    this.updateProgressIndicator()
  }

  updateHeaderStats() {
    const completed = this.learningState.completedWords.size
    const total = this.learningState.totalWords
    const accuracy =
      this.learningState.totalAttempts > 0
        ? Math.round((this.learningState.correctAttempts / this.learningState.totalAttempts) * 100)
        : 0

    document.getElementById("word-counter").textContent = `${this.learningState.currentPosition}/${total}`
    document.getElementById("accuracy-display").textContent = `${accuracy}%`
  }

  updateProgressIndicator() {
    const completed = this.learningState.completedWords.size
    const total = this.learningState.totalWords
    const remaining = this.learningState.vocabularyQueue.length
    const progress = total > 0 ? (completed / total) * 100 : 0

    document.getElementById("progress-fill").style.width = `${progress}%`
    document.getElementById("progress-text").textContent =
      `Đã hoàn thành ${completed}/${total} từ (${Math.round(progress)}%)`
    document.getElementById("remaining-count").textContent = `${remaining} còn lại`
  }

  completeLesson() {
    const currentLesson = this.learningState.currentLesson
    
    // Update completion count
    this.lessonStats[currentLesson.filename] = (this.lessonStats[currentLesson.filename] || 0) + 1
    this.saveLessonStats()

    this.showCompletionModal()

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 100])
    }
  }

  showCompletionModal() {
    const modal = document.getElementById("completion-modal")
    const currentLesson = this.learningState.currentLesson
    const completionCount = this.lessonStats[currentLesson.filename]
    const accuracy =
      this.learningState.totalAttempts > 0
        ? Math.round((this.learningState.correctAttempts / this.learningState.totalAttempts) * 100)
        : 0

    document.getElementById("completion-message").textContent = 
      `Bạn đã hoàn thành bài "${currentLesson.title}"!`
    document.getElementById("final-total").textContent = this.learningState.totalWords
    document.getElementById("final-attempts").textContent = this.learningState.totalAttempts
    document.getElementById("final-accuracy").textContent = `${accuracy}%`
    document.getElementById("final-completion-count").textContent = completionCount

    modal.style.display = "flex"
  }

  hideCompletionModal() {
    document.getElementById("completion-modal").style.display = "none"
  }

  togglePause() {
    this.learningState.isPaused = !this.learningState.isPaused
    const button = document.getElementById("pause-learning")

    if (this.learningState.isPaused) {
      button.textContent = "▶️ Tiếp tục"
      this.showFeedback("⏸️ Đã tạm dừng học tập", "info")
    } else {
      button.textContent = "⏸️ Tạm dừng"
      this.showFeedback("▶️ Tiếp tục học tập", "info")
      setTimeout(() => this.presentNextWord(), 1000)
    }
  }

  restartSession() {
    if (this.learningState.totalWords > 0) {
      const allWords = [...this.learningState.vocabularyQueue, ...Array.from(this.learningState.completedWords)]
      this.shuffleArray(allWords)

      this.learningState.vocabularyQueue = allWords
      this.learningState.completedWords.clear()
      this.learningState.currentPosition = 0
      this.learningState.totalAttempts = 0
      this.learningState.correctAttempts = 0
      this.learningState.isPaused = false

      document.getElementById("pause-learning").textContent = "⏸️ Tạm dừng"

      this.showFeedback("🔄 Đã bắt đầu lại! Chúc bạn học tốt!", "success")
      setTimeout(() => this.presentNextWord(), 1000)
    }
  }

  // Local Storage Management
  loadLessonStats() {
    try {
      const stats = localStorage.getItem("vocabularyLessonStats")
      return stats ? JSON.parse(stats) : {}
    } catch (error) {
      return {}
    }
  }

  saveLessonStats() {
    try {
      localStorage.setItem("vocabularyLessonStats", JSON.stringify(this.lessonStats))
    } catch (error) {
      console.error("Failed to save lesson stats:", error)
    }
  }

  getRandomMessage(type) {
    const messages = this.feedbackMessages[type]
    return messages[Math.floor(Math.random() * messages.length)]
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  new VietnameseVocabularyLearner()
})

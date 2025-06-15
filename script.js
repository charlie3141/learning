class VietnameseVocabularyLearner {
  constructor() {
    // Trạng thái học tập
    this.learningState = {
      vocabularyQueue: [], // Hàng đợi từ vựng chờ học
      completedWords: new Set(), // Từ đã hoàn thành (trả lời đúng)
      currentWord: null,
      currentOptions: [],
      correctAnswer: "",
      totalWords: 0,
      totalAttempts: 0,
      correctAttempts: 0,
      currentPosition: 0,
      isPaused: false,
    }

    // Thông điệp phản hồi bằng tiếng Việt
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
  }

  initializeEventListeners() {
    // File upload
    document.getElementById("file-input").addEventListener("change", (e) => {
      this.handleFileUpload(e.target.files[0])
    })

    // Demo button
    document.getElementById("load-demo").addEventListener("click", () => {
      this.loadDemoVocabulary()
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

  async handleFileUpload(file) {
    if (!file) return

    try {
      const text = await this.readFileAsText(file)
      this.parseVocabularyFile(text)
      this.showFeedback("📁 Tải file thành công! Bắt đầu học ngay!", "success")
      this.startLearningSession()
    } catch (error) {
      this.showFeedback("❌ Lỗi tải file. Vui lòng kiểm tra định dạng!", "error")
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

  parseVocabularyFile(text) {
    const lines = text.split("\n").filter((line) => line.trim())
    const vocabulary = []

    lines.forEach((line) => {
      const parts = line.split(" - ")
      if (parts.length === 2) {
        vocabulary.push({
          english: parts[0].trim().toLowerCase(),
          vietnamese: parts[1].trim(),
        })
      }
    })

    if (vocabulary.length === 0) {
      throw new Error("Không tìm thấy từ vựng hợp lệ")
    }

    // Xáo trộn từ vựng
    this.shuffleArray(vocabulary)

    // Khởi tạo trạng thái học tập
    this.learningState.vocabularyQueue = [...vocabulary]
    this.learningState.totalWords = vocabulary.length
    this.learningState.completedWords.clear()
    this.learningState.currentPosition = 0
    this.learningState.totalAttempts = 0
    this.learningState.correctAttempts = 0
  }

  async loadDemoVocabulary() {
    try {
      // Tải file word.txt mẫu
      const response = await fetch("word.txt")
      const text = await response.text()
      this.parseVocabularyFile(text)
      this.showFeedback("🎮 Đã tải từ vựng mẫu! Bắt đầu học ngay!", "success")
      this.startLearningSession()
    } catch (error) {
      this.showFeedback("❌ Không thể tải từ vựng mẫu!", "error")
      console.error("Demo loading error:", error)
    }
  }

  startLearningSession() {
    if (this.learningState.vocabularyQueue.length === 0) {
      this.showFeedback("📝 Vui lòng tải file từ vựng trước!", "error")
      return
    }

    // Hiển thị giao diện học tập
    document.getElementById("system-status").style.display = "block"
    document.getElementById("learning-interface").style.display = "block"
    document.getElementById("system-controls").style.display = "flex"
    document.querySelector(".file-upload-section").style.display = "none"

    this.updateSystemStatus()
    this.presentNextWord()
  }

  presentNextWord() {
    if (this.learningState.isPaused) return

    // Kiểm tra xem đã hoàn thành tất cả từ chưa
    if (this.learningState.vocabularyQueue.length === 0) {
      this.showCompletionModal()
      return
    }

    // Lấy từ đầu tiên trong hàng đợi
    this.learningState.currentWord = this.learningState.vocabularyQueue[0]
    this.learningState.currentPosition = this.learningState.totalWords - this.learningState.vocabularyQueue.length + 1

    // Tạo các lựa chọn
    this.generateOptionsWithDistractors(this.learningState.currentWord)

    // Cập nhật giao diện
    this.renderWordPresentation()
    this.updateProgressIndicator()
    this.updateSystemStatus()
  }

  generateOptionsWithDistractors(correctWord) {
    const options = [correctWord.vietnamese]

    // Tạo danh sách tất cả từ vựng để chọn đáp án sai
    const allVocabulary = [...this.learningState.vocabularyQueue, ...Array.from(this.learningState.completedWords)]

    // Lọc ra các từ khác để làm đáp án sai
    const otherWords = allVocabulary.filter((word) => word.english !== correctWord.english)

    // Xáo trộn và chọn 4 từ làm đáp án sai
    const shuffledOthers = [...otherWords].sort(() => Math.random() - 0.5)
    for (let i = 0; i < 4 && i < shuffledOthers.length; i++) {
      options.push(shuffledOthers[i].vietnamese)
    }

    // Xáo trộn thứ tự các lựa chọn
    this.shuffleArray(options)

    this.learningState.currentOptions = options
    this.learningState.correctAnswer = correctWord.vietnamese
  }

  renderWordPresentation() {
    const word = this.learningState.currentWord

    // Hiển thị từ tiếng Anh
    document.getElementById("target-word").textContent = word.english.toUpperCase()

    // Cập nhật bộ đếm từ
    document.getElementById("word-counter").textContent =
      `${this.learningState.currentPosition}/${this.learningState.totalWords}`

    // Xác định loại từ
    const contextType = document.getElementById("context-type")
    const isRetry = Array.from(this.learningState.completedWords).some((w) => w.english === word.english)

    if (isRetry) {
      contextType.textContent = "Lặp lại"
      contextType.style.background = "linear-gradient(45deg, #ff9800, #f57c00)"
    } else {
      contextType.textContent = "Từ mới"
      contextType.style.background = "linear-gradient(45deg, #667eea, #764ba2)"
    }

    // Tạo các lựa chọn
    const optionsGrid = document.getElementById("options-grid")
    optionsGrid.innerHTML = ""

    this.learningState.currentOptions.forEach((option, index) => {
      const optionCard = document.createElement("div")
      optionCard.className = "option-card"
      optionCard.textContent = option
      optionCard.addEventListener("click", () => this.handleOptionSelection(option, optionCard))
      optionsGrid.appendChild(optionCard)
    })
  }

  handleOptionSelection(selectedOption, optionElement) {
    const isCorrect = selectedOption === this.learningState.correctAnswer

    // Vô hiệu hóa tất cả lựa chọn
    document.querySelectorAll(".option-card").forEach((card) => {
      card.classList.add("disabled")
    })

    // Hiệu ứng thị giác
    optionElement.classList.add(isCorrect ? "correct" : "incorrect")

    // Cập nhật thống kê
    this.learningState.totalAttempts++

    if (isCorrect) {
      this.handleCorrectAnswer()
    } else {
      this.handleIncorrectAnswer()
    }

    // Tự động chuyển sang từ tiếp theo sau 1.5 giây
    setTimeout(() => {
      this.presentNextWord()
    }, 1500)
  }

  handleCorrectAnswer() {
    const currentWord = this.learningState.currentWord

    // Cập nhật thống kê
    this.learningState.correctAttempts++

    // Xóa từ khỏi hàng đợi và thêm vào danh sách hoàn thành
    this.learningState.vocabularyQueue.shift()
    this.learningState.completedWords.add(currentWord)

    // Phản hồi tích cực
    this.showFeedback(this.getRandomMessage("success"), "success")
  }

  handleIncorrectAnswer() {
    const currentWord = this.learningState.currentWord

    // Xóa từ khỏi đầu hàng đợi và thêm vào cuối để lặp lại sau
    this.learningState.vocabularyQueue.shift()
    this.learningState.vocabularyQueue.push(currentWord)

    // Phản hồi khuyến khích
    this.showFeedback(this.getRandomMessage("error"), "error", `Đáp án đúng là: "${this.learningState.correctAnswer}"`)
  }

  showFeedback(message, type, tip = "") {
    const feedbackElement = document.getElementById("feedback-message")
    const tipElement = document.getElementById("learning-tip")

    feedbackElement.textContent = message
    feedbackElement.className = `feedback-message ${type}`

    tipElement.textContent = tip

    // Xóa phản hồi sau 1.5 giây
    setTimeout(() => {
      feedbackElement.textContent = ""
      feedbackElement.className = "feedback-message"
      tipElement.textContent = ""
    }, 1500)
  }

  updateProgressIndicator() {
    const completed = this.learningState.completedWords.size
    const total = this.learningState.totalWords
    const progress = total > 0 ? (completed / total) * 100 : 0

    document.getElementById("progress-fill").style.width = `${progress}%`
    document.getElementById("progress-text").textContent =
      `Tiến độ: ${completed}/${total} từ đã hoàn thành (${Math.round(progress)}%)`
  }

  updateSystemStatus() {
    const completed = this.learningState.completedWords.size
    const remaining = this.learningState.vocabularyQueue.length
    const accuracy =
      this.learningState.totalAttempts > 0
        ? Math.round((this.learningState.correctAttempts / this.learningState.totalAttempts) * 100)
        : 0

    document.getElementById("total-words").textContent = this.learningState.totalWords
    document.getElementById("completed-words").textContent = completed
    document.getElementById("remaining-words").textContent = remaining
    document.getElementById("accuracy-rate").textContent = `${accuracy}%`
  }

  showCompletionModal() {
    const modal = document.getElementById("completion-modal")
    const accuracy =
      this.learningState.totalAttempts > 0
        ? Math.round((this.learningState.correctAttempts / this.learningState.totalAttempts) * 100)
        : 0

    document.getElementById("final-total").textContent = this.learningState.totalWords
    document.getElementById("final-attempts").textContent = this.learningState.totalAttempts
    document.getElementById("final-accuracy").textContent = accuracy

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
    // Reset trạng thái về ban đầu
    if (this.learningState.totalWords > 0) {
      // Tạo lại hàng đợi từ tất cả từ vựng
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

// Khởi tạo ứng dụng khi DOM đã tải xong
document.addEventListener("DOMContentLoaded", () => {
  new VietnameseVocabularyLearner()
})

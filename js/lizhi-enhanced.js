(function () {
  // ==================== DOM 元素引用 ====================
  const container = document.getElementById("quoteContainer");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const noResults = document.getElementById("noResults");
  const loadMoreIndicator = document.getElementById("loadMoreIndicator");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettings = document.getElementById("closeSettings");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const resetSettings = document.getElementById("resetSettings");
  const searchInput = document.getElementById("searchInput");
  const clearSearch = document.getElementById("clearSearch");
  const clearFilters = document.getElementById("clearFilters");
  const filterTags = document.querySelectorAll('.filter-tag');

  // ==================== 配置常量 ====================
  const CONFIG = {
    LAZY_LOAD: {
      BATCH_SIZE: 10,
      LOAD_THRESHOLD: 300,
      DEBOUNCE_DELAY: 200,
      RETRY_DELAY: 1000,
      MAX_RETRIES: 3
    },
    NOTIFICATION: {
      DURATION: 3000,
      SUCCESS_ICON: '✓',
      ERROR_ICON: '✕'
    },
    DEFAULT_SETTINGS: {
      fontSize: 'text-lg',
      fontColor: 'text-gray-800',
      bgColor: 'gradient-bg-1',
      fontFamily: 'font-serif',
      layoutMode: 'masonry'
    }
  };

  // ==================== 状态管理 ====================
  const state = {
    allQuotes: [],
    filteredQuotes: [],
    currentFilter: 'all',
    searchTerm: '',
    isFetching: false,
    hasMore: true,
    currentPage: 0,
    favorites: new Set(),
    settings: CONFIG.DEFAULT_SETTINGS,
    eventListeners: [],
    observers: []
  };

  // ==================== 工具函数 ====================

  /**
   * 防抖函数
   * @param {Function} func - 要执行的函数
   * @param {number} wait - 等待时间
   * @param {Object} options - 选项
   * @returns {Function}
   */
  function debounce(func, wait, options = { leading: false, trailing: true }) {
    let timeoutId;
    return function (...args) {
      const context = this;
      const callNow = options.leading && !timeoutId;

      const later = () => {
        timeoutId = null;
        if (options.trailing) {
          func.apply(context, args);
        }
      };

      clearTimeout(timeoutId);
      timeoutId = setTimeout(later, wait);

      if (callNow) {
        func.apply(context, args);
      }
    };
  }

  /**
   * 安全获取元素
   * @param {string} selector - 选择器
   * @returns {HTMLElement|null}
   */
  function $(selector) {
    return document.querySelector(selector);
  }

  /**
   * 创建元素
   * @param {string} tag - 标签名
   * @param {Object} options - 选项
   * @returns {HTMLElement}
   */
  function createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.innerHTML) {
      element.innerHTML = options.innerHTML;
    }

    if (options.textContent) {
      element.textContent = options.textContent;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options.onClick) {
      element.addEventListener('click', options.onClick);
      state.eventListeners.push({ element, type: 'click', handler: options.onClick });
    }

    return element;
  }

  /**
   * 创建按钮元素
   * @param {Object} options - 选项
   * @returns {HTMLButtonElement}
   */
  function createButton(options) {
    return createElement('button', {
      className: options.className || 'action-btn',
      innerHTML: options.innerHTML || '',
      attributes: options.attributes || {},
      onClick: options.onClick
    });
  }

  // ==================== 懒加载管理 ====================
  let lazyLoadObserver = null;
  let sentinelElement = null;

  /**
   * 初始化懒加载
   */
  function initLazyLoad() {
    cleanupObservers();

    // 创建哨兵元素
    sentinelElement = createElement('div', {
      attributes: {
        id: 'lazy-load-sentinel',
        'aria-hidden': 'true'
      }
    });
    sentinelElement.style.height = '1px';
    sentinelElement.style.visibility = 'hidden';

    container.parentElement.appendChild(sentinelElement);

    // 创建 Intersection Observer
    lazyLoadObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && state.hasMore && !state.isFetching) {
          loadMoreQuotes();
        }
      });
    }, {
      root: null,
      rootMargin: `${CONFIG.LAZY_LOAD.LOAD_THRESHOLD}px`,
      threshold: 0
    });

    lazyLoadObserver.observe(sentinelElement);
    state.observers.push(lazyLoadObserver);

    // 初始检查
    setTimeout(() => {
      if (state.hasMore && isViewportNotFull()) {
        loadMoreQuotes();
      }
    }, 100);
  }

  /**
   * 清理观察器
   */
  function cleanupObservers() {
    if (lazyLoadObserver && sentinelElement) {
      lazyLoadObserver.unobserve(sentinelElement);
      lazyLoadObserver.disconnect();
      lazyLoadObserver = null;
    }

    state.observers.forEach(observer => {
      observer.disconnect();
    });
    state.observers = [];

    if (sentinelElement && sentinelElement.parentNode) {
      sentinelElement.parentNode.removeChild(sentinelElement);
    }
  }

  /**
   * 检查视口是否不满
   * @returns {boolean}
   */
  function isViewportNotFull() {
    const { scrollY, innerHeight } = window;
    const { scrollHeight } = document.documentElement;
    return scrollHeight < scrollY + innerHeight + 500;
  }

  // ==================== 本地存储管理 ====================

  /**
   * 安全存储数据
   * @param {string} key - 存储键名
   * @param {any} data - 存储数据
   * @returns {boolean}
   */
  function safeSetItem(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        showNotification('存储空间不足，请清理浏览器数据', 'error');
      } else {
        console.error(`存储 ${key} 失败:`, error);
        showNotification('保存失败，请重试', 'error');
      }
      return false;
    }
  }

  /**
   * 安全读取数据
   * @param {string} key - 存储键名
   * @returns {any}
   */
  function safeGetItem(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`读取 ${key} 失败:`, error);
      return null;
    }
  }

  /**
   * 保存设置
   * @param {Object} settings - 设置对象
   * @returns {boolean}
   */
  function saveSettings(settings) {
    state.settings = { ...CONFIG.DEFAULT_SETTINGS, ...settings };
    return safeSetItem('quoteSettings', state.settings);
  }

  /**
   * 加载设置
   * @returns {Object}
   */
  function loadSettings() {
    const saved = safeGetItem('quoteSettings');
    return saved ? { ...CONFIG.DEFAULT_SETTINGS, ...saved } : CONFIG.DEFAULT_SETTINGS;
  }

  /**
   * 清除所有设置
   * @returns {boolean}
   */
  function clearAllSettings() {
    try {
      localStorage.removeItem('quoteSettings');
      state.settings = CONFIG.DEFAULT_SETTINGS;
      return true;
    } catch (error) {
      console.error('清除设置失败:', error);
      return false;
    }
  }

  // ==================== 收藏功能 ====================

  /**
   * 加载收藏列表
   */
  function loadFavorites() {
    const favorites = safeGetItem('quoteFavorites') || [];
    state.favorites = new Set(favorites);
  }

  /**
   * 保存收藏列表
   * @returns {boolean}
   */
  function saveFavorites() {
    const favorites = Array.from(state.favorites);
    return safeSetItem('quoteFavorites', favorites);
  }

  /**
   * 检查是否已收藏
   * @param {number} quoteId - 名言ID
   * @returns {boolean}
   */
  function isFavorited(quoteId) {
    return state.favorites.has(quoteId);
  }

  /**
   * 切换收藏状态
   * @param {number} quoteId - 名言ID
   * @returns {boolean} - 新的收藏状态 (true: 已收藏, false: 未收藏)
   */
  function toggleFavorite(quoteId) {
    const wasFavorited = state.favorites.has(quoteId);

    if (wasFavorited) {
      state.favorites.delete(quoteId);
      showNotification('已取消收藏');
    } else {
      state.favorites.add(quoteId);
      showNotification('已添加到收藏');
    }

    saveFavorites();

    // 如果是收藏筛选模式，重新渲染
    if (state.currentFilter === 'favorites') {
      filterAndRenderQuotes();
    }

    return !wasFavorited;
  }

  // ==================== 分享功能 ====================

  /**
   * 分享名言
   * @param {string} text - 名言内容
   * @param {string} author - 作者
   */
  async function shareQuote(text, author) {
    const shareText = `${text}\n\n—— ${author}`;

    // 尝试使用原生分享API
    if (navigator.share) {
      try {
        await navigator.share({
          title: '人生格言',
          text: shareText
        });
        showNotification('分享成功');
        return;
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.log('分享取消或失败:', error);
        }
      }
    }

    // 降级方案：复制到剪贴板
    await copyToClipboard(shareText, '已复制到剪贴板');
  }

  /**
   * 复制到剪贴板
   * @param {string} text - 要复制的文本
   * @param {string} successMessage - 成功消息
   */
  async function copyToClipboard(text, successMessage = '已复制到剪贴板') {
    try {
      // 优先使用现代API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showNotification(successMessage);
        return;
      }

      // 降级方案：使用传统方法
      const textarea = createElement('textarea', {
        attributes: {
          style: 'position:fixed;opacity:0;'
        }
      });
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();

      try {
        if (document.execCommand('copy')) {
          showNotification(successMessage);
        } else {
          throw new Error('复制失败');
        }
      } catch (execError) {
        console.error('execCommand 复制失败:', execError);
        showNotification('复制失败', 'error');
      } finally {
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('复制失败:', error);
      showNotification('复制失败', 'error');
    }
  }

  /**
   * 复制名言
   * @param {string} text - 名言内容
   * @param {string} author - 作者
   */
  async function copyQuote(text, author) {
    const copyText = `${text}\n\n—— ${author}`;
    await copyToClipboard(copyText);
  }

  // ==================== 搜索高亮 ====================

  /**
   * 创建高亮文本片段
   * @param {string} text - 原始文本
   * @param {string} searchTerm - 搜索词
   * @returns {DocumentFragment}
   */
  function createHighlightedText(text, searchTerm) {
    const fragment = document.createDocumentFragment();

    if (!searchTerm || !text) {
      fragment.appendChild(document.createTextNode(text || ''));
      return fragment;
    }

    // 转义特殊字符
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    parts.forEach((part, index) => {
      if (!part) return;

      if (index % 2 === 1 && part.toLowerCase() === searchTerm.toLowerCase()) {
        const mark = createElement('mark', {
          textContent: part
        });
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });

    return fragment;
  }

  // ==================== 数据加载 ====================

  /**
   * 加载名言数据
   */
  async function loadQuotes() {
    let retryCount = 0;

    while (retryCount < CONFIG.LAZY_LOAD.MAX_RETRIES) {
      try {
        // 创建超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch("./data/lizhi.json", {
          signal: controller.signal,
          cache: 'default'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // 解析JSON
        const quotes = await response.json();

        // 验证数据格式
        if (!Array.isArray(quotes)) {
          throw new Error('数据格式错误');
        }

        // 处理数据
        state.allQuotes = quotes.map((quote, index) => ({
          ...quote,
          id: quote.id || index + 1,
          text: String(quote.text || ''),
          author: String(quote.author || '佚名')
        }));

        // 加载收藏
        loadFavorites();

        // 隐藏加载指示器
        loadingIndicator.classList.add('hidden');

        // 初始渲染
        filterAndRenderQuotes();

        return;

      } catch (error) {
        retryCount++;
        console.error(`加载失败 (尝试 ${retryCount}/${CONFIG.LAZY_LOAD.MAX_RETRIES}):`, error);

        if (retryCount === CONFIG.LAZY_LOAD.MAX_RETRIES) {
          // 所有重试都失败
          setTimeout(() => {
            loadingIndicator.classList.add('hidden');
            container.innerHTML = `
              <div class="col-span-full text-center py-12">
                <p class="text-red-500 mb-4">数据加载失败，请刷新重试</p>
                <button onclick="location.reload()" class="btn btn-primary">
                  刷新页面
                </button>
              </div>
            `;
            showNotification('数据加载失败', 'error');
          }, CONFIG.LAZY_LOAD.RETRY_DELAY);
        } else {
          // 等待后重试
          await new Promise(resolve =>
            setTimeout(resolve, CONFIG.LAZY_LOAD.RETRY_DELAY)
          );
        }
      }
    }
  }

  // ==================== 筛选和渲染 ====================

  /**
   * 筛选名言
   */
  function filterAndRenderQuotes() {
    let tempFilteredQuotes = [...state.allQuotes];

    // 应用筛选
    if (state.currentFilter === 'favorites') {
      tempFilteredQuotes = tempFilteredQuotes.filter(quote =>
        state.favorites.has(quote.id)
      );
    }

    // 应用搜索
    if (state.searchTerm) {
      const searchLower = state.searchTerm.toLowerCase();
      tempFilteredQuotes = tempFilteredQuotes.filter(quote =>
        quote.text.toLowerCase().includes(searchLower) ||
        quote.author.toLowerCase().includes(searchLower)
      );
    }

    state.filteredQuotes = tempFilteredQuotes;

    // 重置状态
    state.currentPage = 0;
    state.hasMore = true;
    state.isFetching = false;
    container.innerHTML = '';
    loadMoreIndicator.classList.add('hidden');

    // 显示/隐藏无结果提示
    if (state.filteredQuotes.length === 0) {
      noResults.classList.remove('hidden');
    } else {
      noResults.classList.add('hidden');
      initLazyLoad();
    }
  }

  /**
   * 加载更多名言
   */
  function loadMoreQuotes() {
    if (state.isFetching || !state.hasMore || state.filteredQuotes.length === 0) {
      return;
    }

    state.isFetching = true;
    loadMoreIndicator.classList.remove('hidden');

    // 模拟异步加载
    setTimeout(() => {
      const startIndex = state.currentPage * CONFIG.LAZY_LOAD.BATCH_SIZE;
      const endIndex = startIndex + CONFIG.LAZY_LOAD.BATCH_SIZE;
      const currentBatch = state.filteredQuotes.slice(startIndex, endIndex);

      if (currentBatch.length > 0) {
        renderQuoteBatch(currentBatch, startIndex);
        state.currentPage++;

        // 计算已渲染的数量
        const totalRendered = (state.currentPage - 1) * CONFIG.LAZY_LOAD.BATCH_SIZE +
          currentBatch.length;
        state.hasMore = totalRendered < state.filteredQuotes.length;
      } else {
        state.hasMore = false;
      }

      state.isFetching = false;
      loadMoreIndicator.classList.add('hidden');

      // 如果还有数据且当前可视区域不满，继续加载
      if (state.hasMore && isViewportNotFull()) {
        setTimeout(loadMoreQuotes, 100);
      }
    }, 300);
  }

  /**
   * 渲染一批名言卡片
   * @param {Array} quotes - 名言数组
   * @param {number} startIndex - 起始索引
   */
  function renderQuoteBatch(quotes, startIndex) {
    quotes.forEach((quote, index) => {
      const globalIndex = startIndex + index;
      const isFavorite = isFavorited(quote.id);

      // 创建卡片容器
      const card = createElement('div', {
        className: `quote-card p-6 text-center rounded-2xl shadow-lg bg-white/90 backdrop-blur-sm fade-in-up`,
        attributes: {
          'data-id': quote.id,
          'data-index': globalIndex
        }
      });
      card.style.animationDelay = `${globalIndex * 0.05}s`;
      card.style.opacity = 0;

      // 创建操作按钮
      const actions = createElement('div', {
        className: 'card-actions'
      });

      // 收藏按钮
      const favoriteBtn = createButton({
        className: `action-btn ${isFavorite ? 'favorited' : ''}`,
        innerHTML: isFavorite ? '❤️' : '🤍',
        attributes: {
          title: isFavorite ? '取消收藏' : '收藏',
          'aria-label': isFavorite ? '取消收藏' : '收藏'
        },
        onClick: (e) => {
          e.stopPropagation();
          const newFavoriteState = toggleFavorite(quote.id);
          favoriteBtn.innerHTML = newFavoriteState ? '❤️' : '🤍';
          favoriteBtn.className = `action-btn ${newFavoriteState ? 'favorited' : ''}`;
          favoriteBtn.title = newFavoriteState ? '取消收藏' : '收藏';
          favoriteBtn.setAttribute('aria-label', newFavoriteState ? '取消收藏' : '收藏');
        }
      });

      // 分享按钮
      const shareBtn = createButton({
        innerHTML: '📤',
        attributes: {
          title: '分享',
          'aria-label': '分享'
        },
        onClick: (e) => {
          e.stopPropagation();
          shareQuote(quote.text, quote.author);
        }
      });

      // 复制按钮
      const copyBtn = createButton({
        innerHTML: '📋',
        attributes: {
          title: '复制',
          'aria-label': '复制'
        },
        onClick: (e) => {
          e.stopPropagation();
          copyQuote(quote.text, quote.author);
        }
      });

      // 添加按钮到操作区域
      actions.appendChild(favoriteBtn);
      actions.appendChild(shareBtn);
      actions.appendChild(copyBtn);

      // 创建卡片内容区域
      const cardContent = createElement('div', {
        className: 'card-content'
      });

      // 开始引号
      const openQuote = createElement('div', {
        className: 'text-4xl text-blue-300 mb-2',
        textContent: '"'
      });

      // 名言正文
      const quoteText = createElement('p', {
        className: 'quote-text mb-4 leading-relaxed whitespace-pre-line'
      });
      quoteText.appendChild(createHighlightedText(quote.text, state.searchTerm));

      // 结束引号
      const closeQuote = createElement('div', {
        className: 'text-4xl text-blue-300 mt-2',
        textContent: '"'
      });

      // 作者信息
      const authorText = createElement('p', {
        className: 'quote-author text-center text-sm text-gray-500 mt-2 italic'
      });
      authorText.appendChild(document.createTextNode('—— '));
      authorText.appendChild(createHighlightedText(quote.author, state.searchTerm));

      // 组装卡片
      cardContent.appendChild(openQuote);
      cardContent.appendChild(quoteText);
      cardContent.appendChild(closeQuote);
      card.appendChild(actions);
      card.appendChild(cardContent);
      card.appendChild(authorText);
      container.appendChild(card);
    });

    // 更新样式
    updateStyle();
  }

  // ==================== 设置管理 ====================

  /**
   * 应用设置到表单
   * @param {Object} settings - 设置对象
   */
  function applySettingsToForm(settings) {
    document.getElementById('fontSize').value = settings.fontSize;
    document.getElementById('fontColor').value = settings.fontColor;
    document.getElementById('bgColor').value = settings.bgColor;
    document.getElementById('fontFamily').value = settings.fontFamily;
    document.getElementById('layoutMode').value = settings.layoutMode;
  }

  /**
   * 从表单获取设置
   * @returns {Object}
   */
  function getSettingsFromForm() {
    return {
      fontSize: document.getElementById('fontSize').value,
      fontColor: document.getElementById('fontColor').value,
      bgColor: document.getElementById('bgColor').value,
      fontFamily: document.getElementById('fontFamily').value,
      layoutMode: document.getElementById('layoutMode').value
    };
  }

  /**
   * 保存设置
   * @returns {boolean}
   */
  function saveSettingsFromForm() {
    const settings = getSettingsFromForm();
    if (saveSettings(settings)) {
      updateStyle();
      return true;
    }
    return false;
  }

  /**
   * 更新页面样式
   */
  function updateStyle() {
    const settings = getSettingsFromForm();

    // 字体大小映射
    const fontSizeMap = {
      'text-base': '1rem',
      'text-lg': '1.125rem',
      'text-xl': '1.25rem',
      'text-2xl': '1.5rem'
    };

    // 字体颜色映射 - 使用 CSS 变量以支持深色模式动态调整
    const fontColorMap = {
      'text-gray-800': 'var(--text-primary)',
      'text-sky-600': '#0ea5e9', // sky-500 optimized for legibility
      'text-blue-600': '#3b82f6', // blue-500
      'text-purple-600': '#a855f7', // purple-500 
      'text-green-600': '#22c55e', // green-500
      'text-amber-700': '#f59e0b'  // amber-500
    };

    // 字体样式映射
    const fontFamilyMap = {
      'font-sans': 'system-ui, -apple-system, sans-serif',
      'font-serif': "'Noto Serif SC', serif",
      'font-mono': 'monospace',
      'chinese-handwriting': "'Ma Shan Zheng', cursive"
    };

    // 更新CSS变量
    const root = document.documentElement;
    root.style.setProperty('--quote-font-size', fontSizeMap[settings.fontSize]);

    // 如果用户选择的是默认深色(text-gray-800)，则使用动态变量，否则使用固定颜色
    if (settings.fontColor === 'text-gray-800') {
      root.style.removeProperty('--quote-font-color'); // 让 CSS 中的 var(--quote-font-color) 生效，或直接设置为 text-primary
      root.style.setProperty('--quote-font-color', 'var(--text-primary)');
    } else {
      // 对于彩色文字，在暗色模式下稍微调亮一点，或者保持原色（目前为了简单保持原色，但可以使用 bright variants）
      root.style.setProperty('--quote-font-color', fontColorMap[settings.fontColor]);
    }

    root.style.setProperty('--quote-font-family', fontFamilyMap[settings.fontFamily]);

    // 更新页面背景
    document.body.className = `flex flex-col min-h-screen transition-all duration-500 ${settings.bgColor} text-gray-800`;

    // 更新布局
    if (settings.layoutMode === 'grid') {
      container.className = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3';
    } else {
      container.className = 'masonry-grid';
    }
  }

  // ==================== 事件监听器管理 ====================

  /**
   * 设置搜索功能
   */
  function setupSearch() {
    const debouncedSearch = debounce((searchTerm) => {
      state.searchTerm = searchTerm.trim();
      filterAndRenderQuotes();
    }, 300);

    // 搜索输入事件
    searchInput.addEventListener('input', function () {
      const searchTerm = this.value;

      // 显示/隐藏清除按钮
      clearSearch.style.display = searchTerm ? 'block' : 'none';

      // 使用防抖搜索
      debouncedSearch(searchTerm);
    });

    state.eventListeners.push({
      element: searchInput,
      type: 'input',
      handler: debouncedSearch
    });

    // 回车键立即搜索
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        state.searchTerm = this.value.trim();
        filterAndRenderQuotes();
      }
    });

    // 清除搜索
    clearSearch.addEventListener('click', function () {
      searchInput.value = '';
      state.searchTerm = '';
      this.style.display = 'none';
      filterAndRenderQuotes();
    });
  }

  /**
   * 设置筛选功能
   */
  function setupFilters() {
    filterTags.forEach(tag => {
      tag.addEventListener('click', function () {
        // 更新激活状态
        filterTags.forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        // 更新筛选状态
        state.currentFilter = this.dataset.filter;

        // 重新渲染
        filterAndRenderQuotes();
      });
    });

    // 清除筛选按钮
    clearFilters.addEventListener('click', function () {
      // 重置搜索
      searchInput.value = '';
      state.searchTerm = '';
      clearSearch.style.display = 'none';

      // 重置筛选
      state.currentFilter = 'all';
      filterTags.forEach(t => t.classList.remove('active'));
      filterTags[0].classList.add('active');

      // 重新渲染
      filterAndRenderQuotes();
    });
  }

  /**
   * 设置设置弹窗
   */
  function setupSettingsModal() {
    // 打开设置
    settingsBtn.addEventListener('click', function () {
      settingsModal.style.display = 'flex';
      this.classList.add('float-animation');
      setTimeout(() => {
        this.classList.remove('float-animation');
      }, 3000);
    });

    // 关闭设置
    closeSettings.addEventListener('click', function () {
      settingsModal.style.display = 'none';
    });

    // 点击外部关闭
    settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });

    // ESC 键关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
        settingsModal.style.display = 'none';
      }
    });

    // 保存设置
    saveSettingsBtn.addEventListener('click', function () {
      if (saveSettingsFromForm()) {
        showNotification('设置已保存');
        settingsModal.style.display = 'none';
      }
    });

    // 重置设置
    resetSettings.addEventListener('click', function () {
      if (confirm('确定要恢复默认设置吗？')) {
        clearAllSettings();
        applySettingsToForm(CONFIG.DEFAULT_SETTINGS);
        updateStyle();
        showNotification('已恢复默认设置');
      }
    });
  }

  // ==================== 通知功能 ====================

  /**
   * 显示通知
   * @param {string} message - 通知消息
   * @param {string} type - 通知类型 (success, error, warning)
   */
  function showNotification(message, type = 'success') {
    const notification = createElement('div', {
      className: `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg fade-in-up flex items-center gap-2 ${type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
          'bg-yellow-500 text-white'
        }`
    });

    const icon = type === 'success' ? CONFIG.NOTIFICATION.SUCCESS_ICON :
      type === 'error' ? CONFIG.NOTIFICATION.ERROR_ICON : '⚠️';

    notification.innerHTML = `
      <span class="text-xl">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // 自动移除
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, CONFIG.NOTIFICATION.DURATION);
  }

  // ==================== 清理函数 ====================

  /**
   * 清理事件监听器
   */
  function cleanupEventListeners() {
    state.eventListeners.forEach(({ element, type, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(type, handler);
      }
    });
    state.eventListeners = [];
  }

  /**
   * 页面卸载清理
   */
  function setupCleanup() {
    window.addEventListener('beforeunload', () => {
      cleanupEventListeners();
      cleanupObservers();
    });

    window.addEventListener('pagehide', () => {
      cleanupEventListeners();
      cleanupObservers();
    });
  }

  // ==================== 初始化 ====================

  /**
   * 设置回到顶部按钮
   */
  function setupBackToTop() {
    const backToTopBtn = createElement('button', {
      className: 'back-to-top',
      innerHTML: '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>',
      attributes: {
        'aria-label': '回到顶部',
        title: '回到顶部'
      },
      onClick: () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    });
    document.body.appendChild(backToTopBtn);

    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    });
  }

  /**
   * 初始化应用
   */
  function init() {
    try {
      setupCleanup();
      loadFavorites(); // New call

      // 从 localStorage 加载设置
      const savedSettings = loadSettings();
      state.settings = savedSettings;
      applySettingsToForm(savedSettings);
      updateStyle(); // 立即应用样式

      // 设置事件监听
      setupSearch();
      setupFilters();
      setupSettingsModal();
      setupBackToTop(); // 新增回到顶部

      // 添加手写体样式
      const style = document.createElement('style');
      style.textContent = `
        .chinese-handwriting {
          font-family: 'Ma Shan Zheng', cursive;
        }
      `;
      document.head.appendChild(style);

      // 加载数据
      loadQuotes();

      // Check URL search params
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('q');
      if (q) {
        state.searchTerm = q;
        searchInput.value = q;
        clearSearch.style.display = 'block';
      }

    } catch (error) {
      console.error('初始化失败:', error);
      showNotification('应用初始化失败，请刷新页面', 'error');
    }
  }

  // 启动应用
  document.addEventListener('DOMContentLoaded', init);

})();

document.addEventListener('DOMContentLoaded', () => {
  const userId =  localStorage.getItem('id'); // Mock user ID
  window.currentUserId = userId;

  // Utility function for API requests
  async function makeApiRequest(url, method = 'POST', headers = {}) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'X-User-ID': userId,
          'Content-Type': 'application/json',
          ...headers
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${method.toLowerCase()} request`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API error at ${url}:`, error);
      throw error;
    }
  }

  // Handle like button clicks
  function setupLikeButtons() {
    const likeButtons = document.querySelectorAll('.like-button');
    if (likeButtons.length === 0) {
      console.warn('No like buttons found in DOM');
      return;
    }
    likeButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const charId = button.getAttribute('data-char-id');
        if (!charId) {
          console.error('Like button missing data-char-id attribute');
          return;
        }
        console.log(`[${new Date().toISOString()}] Liking character: ${charId}`);
        try {
          const data = await makeApiRequest(`/api/char/${charId}/like?uid=${userId}`);
          const likeCountSpan = button.querySelector('.like-count');
          if (likeCountSpan) {
            likeCountSpan.textContent = data.likeCount || 0;
            button.classList.toggle('liked', data.liked);
          } else {
            console.warn(`Like count span not found for charId: ${charId}`);
          }
        } catch (error) {
          console.error(`Failed to like character ${charId}:`, error);
          alert(`Failed to like character: ${error.message}`);
        }
      });
    });
  }

  // Handle character card clicks
  function setupCharacterCards() {
    const cards = document.querySelectorAll('.character-card');
    if (cards.length === 0) {
      console.warn('No character cards found in DOM');
      return;
    }
    cards.forEach(card => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.like-button')) return;
        const charId = card.getAttribute('data-char-id');
        if (!charId) {
          console.error('Character card missing data-char-id attribute');
          return;
        }
        console.log(`Navigating to chat for charId: ${charId}`);
        window.location.href = `/chat/c/${charId}?uid=${userId}`;
      });

      const img = card.querySelector('img');
      if (img) {
        img.addEventListener('error', () => {
          console.warn(`Failed to load image for charId: ${card.getAttribute('data-char-id')}, src: ${img.src}`);
          img.src = '/images/fallback.png';
        });
      } else {
        console.warn(`No image found in character card for charId: ${card.getAttribute('data-char-id')}`);
      }

      const viewCountSpan = card.querySelector('.view-count');
      if (!viewCountSpan) {
        console.warn(`View count span not found for charId: ${card.getAttribute('data-char-id')}`);
      }
    });
  }

  // Handle follow button
  function setupFollowButton() {
    const followButton = document.querySelector('.follow-btn');
    if (!followButton) {
      console.warn('Follow button (.follow-btn) not found in DOM');
      return;
    }

    followButton.addEventListener('click', async () => {
      const creatorId = followButton.getAttribute('data-creator-id');
      console.log(`[${new Date().toISOString()}] Toggling follow for creatorId: ${creatorId}`);

      try {
        const data = await makeApiRequest(`/api/user/${creatorId}/follow?uid=${userId}`);
        followButton.textContent = data.followed ? 'Unfollow' : 'Follow';
        followButton.classList.toggle('following', data.followed);
        const followersSpan = document.querySelector('.creator-header p:last-child');
        if (followersSpan) {
          followersSpan.textContent = `Followers: ${data.followerCount}`;
        } else {
          console.warn('Followers span not found');
        }
      } catch (error) {
        alert(`Failed to follow creator: ${error.message}`);
      }
    });
  }

  // Handle slider navigation
  function setupSlider() {
    const slider = document.querySelector('.slider-container');
    if (!slider) return;

    const prevButton = document.createElement('button');
    prevButton.textContent = '←';
    prevButton.className = 'slider-nav prev';
    const nextButton = document.createElement('button');
    nextButton.textContent = '→';
    nextButton.className = 'slider-nav next';

    slider.parentElement.insertBefore(prevButton, slider);
    slider.parentElement.appendChild(nextButton);

    let scrollPosition = 0;
    const scrollAmount = 300;

    prevButton.addEventListener('click', () => {
      scrollPosition -= scrollAmount;
      if (scrollPosition < 0) scrollPosition = 0;
      slider.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    });

    nextButton.addEventListener('click', () => {
      scrollPosition += scrollAmount;
      if (scrollPosition > slider.scrollWidth - slider.clientWidth) {
        scrollPosition = slider.scrollWidth - slider.clientWidth;
      }
      slider.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    });

    let autoScroll = setInterval(() => {
      scrollPosition += scrollAmount;
      if (scrollPosition > slider.scrollWidth - slider.clientWidth) {
        scrollPosition = 0;
      }
      slider.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }, 5000);

    slider.addEventListener('mouseenter', () => clearInterval(autoScroll));
    slider.addEventListener('mouseleave', () => {
      autoScroll = setInterval(() => {
        scrollPosition += scrollAmount;
        if (scrollPosition > slider.scrollWidth - slider.clientWidth) {
          scrollPosition = 0;
        }
        slider.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }, 5000);
    });
  }

  // Initialize with retry
  const initialize = () => {
    setupLikeButtons();
    setupCharacterCards();
    setupFollowButton();
    setupSlider();

    if (!document.querySelector('.character-card')) {
      console.warn('No character cards found, retrying initialization...');
      setTimeout(initialize, 1000);
    }
  };
  initialize();
});
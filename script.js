// ============================================
// 导航栏交互
// ============================================
const navbar = document.getElementById('navbar');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navScrim = document.getElementById('navScrim');

const closeMobileNav = () => {
    navToggle.classList.remove('active');
    navLinks.classList.remove('active');
    navScrim.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开导航菜单');
    document.body.classList.remove('menu-open');
};

// 滚动时改变导航栏样式
window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// 移动端菜单
navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('active');
    navToggle.classList.toggle('active', isOpen);
    navScrim.classList.toggle('active', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? '关闭导航菜单' : '打开导航菜单');
    document.body.classList.toggle('menu-open', isOpen);
});

navScrim.addEventListener('click', closeMobileNav);

// 点击链接后关闭移动端菜单
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', closeMobileNav);
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks.classList.contains('active')) {
        closeMobileNav();
        navToggle.focus();
    }
});

// ============================================
// 滚动触发动画 (Intersection Observer)
// ============================================
const revealTargets = document.querySelectorAll(
    '.section-header, .about-text, .about-values, .value-card, ' +
    '.skill-card, .experience-card, .highlight-item, ' +
    '.project-card, .contact-card, .contact-method'
);

// 为每个目标添加 reveal 类
revealTargets.forEach((el, index) => {
    el.classList.add('reveal');
    // 交错延迟
    if (index % 3 === 1) el.classList.add('reveal-delay-1');
    if (index % 3 === 2) el.classList.add('reveal-delay-2');
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -80px 0px'
});

revealTargets.forEach(el => observer.observe(el));

// ============================================
// 作品集：移动端层叠覆盖效果
// 向下滚动时，下一张卡片像叠牌一样盖住上一张
// ============================================
const projectCards = document.querySelectorAll('.project-card');
const mobileQuery = window.matchMedia('(max-width: 768px)');

const initStackEffect = () => {
    if (!mobileQuery.matches) {
        // 桌面端：清除内联样式，恢复正常布局
        projectCards.forEach(card => {
            card.style.transform = '';
            card.style.position = '';
            card.style.top = '';
            card.style.zIndex = '';
            card.style.opacity = '';
        });
        return;
    }

    projectCards.forEach((card, i) => {
        card.style.position = 'sticky';
        card.style.top = '90px';
        card.style.zIndex = i + 1;
    });

    // 滚动时根据卡片在视口中的位置做缩放和透明度变化
    const onScroll = () => {
        projectCards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const vh = window.innerHeight;
            // 卡片顶部距离视口顶部的比例（0~1+）
            const progress = Math.max(0, Math.min(1, (vh - rect.top) / vh));
            // 当卡片被下一张往上推时，轻微缩小并增加阴影
            const scale = 1 - (1 - progress) * 0.03;
            card.style.transform = `scale(${Math.max(0.94, scale)})`;
        });
    };

    window.removeEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
};

initStackEffect();
mobileQuery.addEventListener('change', initStackEffect);

// ============================================
// Hero 区：移动端人物位置
// ============================================
const heroContent = document.querySelector('.hero-content');
const heroTitle = document.querySelector('.hero-title');
const heroVisual = document.querySelector('.hero-visual');
const mobileHeroQuery = window.matchMedia('(max-width: 640px)');
const heroVisualPlaceholder = document.createComment('hero-visual-position');

if (heroVisual && heroContent) {
    heroContent.insertBefore(heroVisualPlaceholder, heroVisual);

    const placeHeroVisual = () => {
        if (mobileHeroQuery.matches && heroTitle) {
            heroTitle.insertAdjacentElement('afterend', heroVisual);
        } else {
            heroVisualPlaceholder.after(heroVisual);
        }
    };

    placeHeroVisual();
    mobileHeroQuery.addEventListener('change', placeHeroVisual);
}

// ============================================
// Hero 区视差效果
// ============================================
const heroBlobs = document.querySelectorAll('.hero .blob');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (!prefersReducedMotion && hasFinePointer) {
    window.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const moveX = (clientX - centerX) / centerX;
        const moveY = (clientY - centerY) / centerY;

        heroBlobs.forEach((blob, index) => {
            const speed = (index + 1) * 15;
            blob.style.transform = `translate(${moveX * speed}px, ${moveY * speed}px)`;
        });
    });
}

// ============================================
// 导航高亮当前板块
// ============================================
const sections = document.querySelectorAll('section[id]');
const navItems = document.querySelectorAll('.nav-links a');

const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            navItems.forEach(item => {
                item.classList.remove('active-nav');
                if (item.getAttribute('href') === `#${id}`) {
                    item.classList.add('active-nav');
                }
            });
        }
    });
}, { threshold: 0.3 });

sections.forEach(section => navObserver.observe(section));

// ============================================
// 数字滚动动画
// ============================================
const statNumbers = document.querySelectorAll('.stat-number');
let statsAnimated = false;

const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !statsAnimated) {
            statsAnimated = true;
            statNumbers.forEach(stat => {
                const text = stat.textContent;
                const number = parseInt(text.match(/\d+/)?.[0] || '0');
                const suffix = text.replace(/[\d,]/g, '');

                if (number > 0) {
                    let current = 0;
                    const increment = Math.ceil(number / 40);
                    const timer = setInterval(() => {
                        current += increment;
                        if (current >= number) {
                            current = number;
                            clearInterval(timer);
                        }
                        // 保留原始后缀中的非数字部分
                        const plusMatch = text.match(/[^\d]+$/);
                        const plusText = plusMatch ? plusMatch[0] : '';
                        stat.innerHTML = current + (plusText ? `<span class="stat-plus">${plusText}</span>` : '');
                    }, 25);
                }
            });
        }
    });
}, { threshold: 0.5 });

const heroStats = document.querySelector('.hero-stats');
if (heroStats) statObserver.observe(heroStats);

// ============================================
// 平滑滚动（兼容旧浏览器）
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const target = document.querySelector(targetId);
        if (target) {
            e.preventDefault();
            const offset = 70;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ============================================
// 深色模式切换
// ============================================
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

themeToggle.addEventListener('click', () => {
    const currentTheme = root.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else {
        root.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', newTheme);
});

// ============================================
// 返回顶部按钮
// ============================================
const backToTop = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
    if (window.scrollY > 600) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
});

backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ============================================
// 页面加载动画
// DOM 就绪后很快隐藏，不必等待大图等全部资源加载完，避免长时间卡在加载画面
// ============================================
const hideLoader = () => {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
};
// DOM 就绪即快速淡出，不再等待大图等资源，缩短“启动进入”时间
window.addEventListener('DOMContentLoaded', () => setTimeout(hideLoader, 150));
window.addEventListener('load', hideLoader); // load 事件兜底（防止极端情况下遮罩不消失）
setTimeout(hideLoader, 2500); // 硬兜底：2.5s 后无论如何隐藏

// 项目详情已迁移至 case-study.html，并在新标签页打开。


// ============================================
// 微信号一键复制（移动端友好，含兜底）
// ============================================
(function () {
    const btn = document.getElementById('wechatCopy');
    const hint = document.getElementById('wechatHint');
    if (!btn) return;
    const showTip = (text) => {
        if (!hint) return;
        const old = hint.textContent;
        hint.textContent = text;
        hint.classList.add('copied');
        setTimeout(() => { hint.textContent = old; hint.classList.remove('copied'); }, 1600);
    };
    const fallbackCopy = (text) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        return ok;
    };
    btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy') || '';
        let ok = false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                ok = true;
            } else {
                ok = fallbackCopy(text);
            }
        } catch (e) {
            ok = fallbackCopy(text);
        }
        showTip(ok ? '✓ 已复制微信号' : '请长按号码复制');
    });
})();

document.addEventListener('DOMContentLoaded', () => {
  // 1. Dynamic Year
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // 2. Theme Toggle with LocalStorage
  const themeToggle = document.getElementById('themeToggle');
  const htmlRoot = document.documentElement;

  const savedTheme = localStorage.getItem('peac-executive-theme');
  if (savedTheme) {
    htmlRoot.setAttribute('data-theme', savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    htmlRoot.setAttribute('data-theme', 'light');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = htmlRoot.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      htmlRoot.setAttribute('data-theme', newTheme);
      localStorage.setItem('peac-executive-theme', newTheme);
    });
  }

  // 3. Mobile Navigation Menu
  const menuToggle = document.getElementById('menuToggle');
  const navMenu = document.getElementById('navMenu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });

    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
      });
    });
  }

  // 4. One-Click Copy Email
  const copyBtn = document.getElementById('copyEmailBtn');
  const emailDisplay = document.getElementById('emailDisplay');

  if (copyBtn && emailDisplay) {
    copyBtn.addEventListener('click', () => {
      const email = emailDisplay.textContent.trim();
      navigator.clipboard.writeText(email).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        copyBtn.style.borderColor = 'var(--accent-gold)';
        copyBtn.style.color = 'var(--accent-gold)';

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.borderColor = '';
          copyBtn.style.color = '';
        }, 2200);
      }).catch(err => {
        console.error('Copy failed: ', err);
      });
    });
  }

  // 5. Innovative Feature: Save Executive Contact Card (vCard .vcf)
  const saveVCardBtn = document.getElementById('saveVCardBtn');
  if (saveVCardBtn) {
    saveVCardBtn.addEventListener('click', () => {
      const vCardData = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Peter Ac',
        'N:Ac;Peter;;;',
        'TITLE:Supply Chain & Technology & Innovation Executive',
        'EMAIL;TYPE=INTERNET,WORK:peter@iampeac.com',
        'URL;TYPE=WORK:https://iampeac.com',
        'X-SOCIALPROFILE;type=linkedin:https://www.linkedin.com/in/peter-ac/',
        'ADR;TYPE=WORK:;;Malmö;;;Sweden',
        'NOTE:Supply chain, technology, and innovation executive connecting global operations, industrial automation, and enterprise systems.',
        'END:VCARD'
      ].join('\r\n');

      const blob = new Blob([vCardData], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.setAttribute('download', 'Peter_Ac_Executive.vcf');
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    });
  }
});

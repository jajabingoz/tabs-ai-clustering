// Handle upgrade buttons
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-plan]').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const plan = e.target.getAttribute('data-plan');
            
            // Check if TabsAI extension is installed
            if (typeof browser !== 'undefined' || typeof chrome !== 'undefined') {
                // Extension context - send message to extension
                const runtime = browser?.runtime || chrome?.runtime;
                runtime.sendMessage({
                    type: 'upgrade',
                    plan: plan
                });
            } else {
                // Web context - redirect to signup
                window.location.href = `https://app.tabsai.com/signup?plan=${plan}`;
            }
        });
    });

    // FAQ interactions
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isOpen = answer.style.display === 'block';
            
            // Close all answers
            document.querySelectorAll('.faq-answer').forEach(ans => {
                ans.style.display = 'none';
            });
            
            // Open this answer if it was closed
            if (!isOpen) {
                answer.style.display = 'block';
            }
        });
    });

    // Analytics tracking (replace with your analytics service)
    function trackEvent(action, category = 'pricing') {
        console.log(`Tracking: ${category} - ${action}`);
        // Example: gtag('event', action, { event_category: category });
    }

    // Track plan views
    trackEvent('page_view');
});
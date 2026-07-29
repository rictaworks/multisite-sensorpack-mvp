/* @ds-bundle: {"format":3,"namespace":"VelioraOfficeDesignSystem_3bad8c","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"FAQItem","sourcePath":"components/core/FAQItem.jsx"},{"name":"NavBar","sourcePath":"components/core/NavBar.jsx"},{"name":"ServiceCard","sourcePath":"components/core/ServiceCard.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"1c275f631b1f","components/core/Button.jsx":"fd2f02d686cb","components/core/FAQItem.jsx":"aa246a67d48b","components/core/NavBar.jsx":"fa27faa60bf4","components/core/ServiceCard.jsx":"ea936dfe4e48"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VelioraOfficeDesignSystem_3bad8c = window.VelioraOfficeDesignSystem_3bad8c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function Badge({
  children,
  variant = 'navy',
  size = 'md'
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    borderRadius: '9999px',
    whiteSpace: 'nowrap'
  };
  const sizes = {
    sm: {
      padding: '3px 10px',
      fontSize: '9px'
    },
    md: {
      padding: '5px 14px',
      fontSize: '10px'
    },
    lg: {
      padding: '7px 18px',
      fontSize: '11px'
    }
  };
  const variants = {
    navy: {
      background: 'var(--color-navy-900, #0a1628)',
      color: '#ffffff'
    },
    blue: {
      background: 'var(--color-blue-500, #1a73e8)',
      color: '#ffffff'
    },
    'blue-light': {
      background: 'var(--color-blue-100, #d8e8f8)',
      color: 'var(--color-navy-900, #0a1628)'
    },
    muted: {
      background: 'var(--color-gray-100, #f0f4f8)',
      color: 'var(--color-gray-500, #6b82a0)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-blue-500, #1a73e8)',
      border: '1px solid var(--color-blue-500, #1a73e8)'
    },
    'outline-light': {
      background: 'transparent',
      color: 'rgba(255,255,255,0.8)',
      border: '1px solid rgba(255,255,255,0.3)'
    }
  };
  return React.createElement('span', {
    style: {
      ...base,
      ...sizes[size],
      ...variants[variant]
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'right',
  disabled = false,
  onClick
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    letterSpacing: '0.06em',
    textDecoration: 'none',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
    whiteSpace: 'nowrap',
    borderRadius: variant === 'pill' ? '9999px' : '4px'
  };
  const sizes = {
    sm: {
      padding: '10px 18px',
      fontSize: '11px'
    },
    md: {
      padding: '14px 28px',
      fontSize: '13px'
    },
    lg: {
      padding: '18px 36px',
      fontSize: '14px'
    }
  };
  const variants = {
    primary: {
      background: 'var(--color-blue-500, #1a73e8)',
      color: '#ffffff'
    },
    secondary: {
      background: 'transparent',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.4)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-blue-500, #1a73e8)',
      border: '1px solid var(--color-blue-500, #1a73e8)'
    },
    dark: {
      background: 'var(--color-navy-900, #0a1628)',
      color: '#ffffff'
    },
    pill: {
      background: 'var(--color-blue-500, #1a73e8)',
      color: '#ffffff'
    }
  };
  const style = {
    ...base,
    ...sizes[size],
    ...variants[variant]
  };
  const handleMouseEnter = e => {
    if (disabled) return;
    if (variant === 'primary' || variant === 'pill') {
      e.currentTarget.style.background = 'var(--color-blue-600, #1565c0)';
      e.currentTarget.style.transform = 'translateX(2px)';
    } else if (variant === 'ghost') {
      e.currentTarget.style.background = 'rgba(26,115,232,0.08)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)';
    }
  };
  const handleMouseLeave = e => {
    if (disabled) return;
    e.currentTarget.style.background = style.background;
    e.currentTarget.style.transform = '';
    e.currentTarget.style.borderColor = style.borderColor || '';
  };
  return React.createElement('button', {
    style,
    disabled,
    onClick,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave
  }, iconPosition === 'left' && icon ? React.createElement('i', {
    className: icon,
    style: {
      fontSize: '13px'
    }
  }) : null, children, iconPosition === 'right' && icon ? React.createElement('i', {
    className: icon,
    style: {
      fontSize: '13px'
    }
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/FAQItem.jsx
try { (() => {
function FAQItem({
  question,
  answer,
  defaultOpen = false
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return React.createElement('div', {
    style: {
      background: '#ffffff',
      borderRadius: '8px',
      border: '1px solid rgba(10,22,40,0.1)',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
    }
  }, React.createElement('button', {
    onClick: () => setOpen(o => !o),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 24px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      gap: '16px'
    }
  }, React.createElement('span', {
    style: {
      fontFamily: "'Noto Sans JP', sans-serif",
      fontSize: '14px',
      fontWeight: 500,
      color: 'var(--color-navy-900, #0a1628)',
      letterSpacing: '0.03em',
      lineHeight: 1.5
    }
  }, question), React.createElement('div', {
    style: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      background: open ? 'var(--color-blue-500, #1a73e8)' : 'var(--color-navy-900, #0a1628)',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: '14px',
      transition: 'background 0.2s, transform 0.3s',
      transform: open ? 'rotate(45deg)' : 'rotate(0deg)'
    }
  }, React.createElement('i', {
    className: 'fa-solid fa-plus'
  }))), React.createElement('div', {
    style: {
      maxHeight: open ? '200px' : '0',
      overflow: 'hidden',
      transition: 'max-height 0.3s ease, padding 0.3s ease',
      padding: open ? '0 24px 20px' : '0 24px'
    }
  }, React.createElement('p', {
    style: {
      fontFamily: "'Noto Sans JP', sans-serif",
      fontSize: '13px',
      color: 'var(--color-gray-500, #6b82a0)',
      lineHeight: 1.8,
      borderTop: '1px solid rgba(0,0,0,0.06)',
      paddingTop: '16px',
      margin: 0
    }
  }, answer)));
}
Object.assign(__ds_scope, { FAQItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/FAQItem.jsx", error: String((e && e.message) || e) }); }

// components/core/NavBar.jsx
try { (() => {
function NavBar({
  items = [],
  ctaLabel = 'お問い合わせ',
  logoText = 'VELIORA OFFICE',
  activeItem = ''
}) {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);
  const navItems = items.length ? items : ['Service', 'About', 'Case', 'News', 'Contact'];
  return React.createElement('header', {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: scrolled ? 'rgba(10,22,40,0.98)' : 'rgba(10,22,40,0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 40px',
      transition: 'background 0.3s'
    }
  }, React.createElement('div', {
    style: {
      maxWidth: '1100px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, React.createElement('a', {
    href: '#',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      textDecoration: 'none'
    }
  }, React.createElement('svg', {
    width: 28,
    height: 28,
    viewBox: '0 0 28 28',
    fill: 'none'
  }, React.createElement('polygon', {
    points: '14,2 26,24 2,24',
    fill: 'none',
    stroke: 'white',
    strokeWidth: 2
  }), React.createElement('polygon', {
    points: '14,8 21,22 7,22',
    fill: '#1a73e8'
  })), React.createElement('span', {
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: '14px',
      fontWeight: 700,
      letterSpacing: '0.15em',
      color: '#ffffff',
      textTransform: 'uppercase'
    }
  }, logoText)), React.createElement('nav', {
    style: {
      display: 'flex',
      gap: '36px'
    }
  }, ...navItems.map(item => React.createElement('a', {
    key: item,
    href: '#',
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '0.1em',
      color: item === activeItem ? '#ffffff' : 'rgba(255,255,255,0.85)',
      textDecoration: 'none',
      textTransform: 'uppercase',
      transition: 'color 0.2s',
      borderBottom: item === activeItem ? '2px solid #1a73e8' : '2px solid transparent',
      paddingBottom: '2px'
    }
  }, item)))));
}
Object.assign(__ds_scope, { NavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/NavBar.jsx", error: String((e && e.message) || e) }); }

// components/core/ServiceCard.jsx
try { (() => {
function ServiceCard({
  title,
  icon,
  description,
  accentLine = true
}) {
  const [hovered, setHovered] = React.useState(false);
  return React.createElement('div', {
    style: {
      background: 'rgba(255,255,255,0.97)',
      borderRadius: '8px',
      padding: '28px 20px',
      textAlign: 'center',
      transition: 'transform 0.3s, box-shadow 0.3s',
      transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
      boxShadow: hovered ? '0 16px 48px rgba(0,0,0,0.30)' : '0 2px 12px rgba(0,0,0,0.08)',
      cursor: 'default',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false)
  }, React.createElement('div', {
    style: {
      fontFamily: "'Noto Sans JP', sans-serif",
      fontSize: '14px',
      fontWeight: 700,
      color: 'var(--color-navy-900, #0a1628)',
      paddingBottom: '14px',
      marginBottom: '20px',
      borderBottom: '2px solid var(--color-navy-900, #0a1628)',
      letterSpacing: '0.05em',
      width: '100%'
    }
  }, title), React.createElement('div', {
    style: {
      fontSize: '38px',
      color: 'var(--color-navy-600, #1a3560)',
      margin: '10px 0 22px'
    }
  }, React.createElement('i', {
    className: icon
  })), React.createElement('p', {
    style: {
      fontSize: '11.5px',
      color: '#4a5a78',
      lineHeight: 1.8,
      fontFamily: "'Noto Sans JP', sans-serif",
      textAlign: 'left'
    }
  }, description));
}
Object.assign(__ds_scope, { ServiceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ServiceCard.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.FAQItem = __ds_scope.FAQItem;

__ds_ns.NavBar = __ds_scope.NavBar;

__ds_ns.ServiceCard = __ds_scope.ServiceCard;

})();

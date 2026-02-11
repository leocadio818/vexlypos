import { useState, useEffect, useCallback } from 'react';

/**
 * Device detection hook for responsive POS system
 * Detects device type, screen size, orientation and provides responsive breakpoints
 */
export function useDeviceDetect() {
  const getDeviceInfo = useCallback(() => {
    const ua = navigator.userAgent.toLowerCase();
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Device type detection
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isTablet = /ipad/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua)) || (width >= 768 && width <= 1024);
    const isMobile = (isIOS || isAndroid) && !isTablet && width < 768;
    const isDesktop = !isMobile && !isTablet;
    
    // Touch detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Orientation
    const isLandscape = width > height;
    const isPortrait = height > width;
    
    // Screen size categories
    const isXSmall = width < 480;  // Small phones
    const isSmall = width >= 480 && width < 768;  // Large phones
    const isMedium = width >= 768 && width < 1024;  // Tablets portrait / small laptops
    const isLarge = width >= 1024 && width < 1440;  // Tablets landscape / laptops
    const isXLarge = width >= 1440;  // Desktop / large screens
    
    // POS-specific breakpoints
    const posMode = isXSmall || isSmall ? 'mobile' : 
                    isMedium ? 'tablet' : 
                    isLarge ? 'desktop' : 'large-desktop';
    
    // Grid columns based on device
    const getGridCols = (type) => {
      if (type === 'categories') {
        if (isXSmall) return 2;
        if (isSmall) return 3;
        if (isMedium) return 4;
        if (isLarge) return 5;
        return 6;
      }
      if (type === 'products') {
        if (isXSmall) return 2;
        if (isSmall) return 2;
        if (isMedium) return 3;
        if (isLarge) return 4;
        return 5;
      }
      if (type === 'payment-methods') {
        if (isXSmall) return 2;
        if (isSmall) return 2;
        if (isMedium) return 3;
        return 3;
      }
      if (type === 'tables') {
        if (isXSmall) return 2;
        if (isSmall) return 3;
        if (isMedium) return 4;
        return 6;
      }
      return 4;
    };
    
    // Button sizes based on device
    const getButtonSize = (variant = 'default') => {
      const sizes = {
        mobile: {
          default: 'h-14 text-base',
          small: 'h-10 text-sm',
          large: 'h-16 text-lg',
          icon: 'h-12 w-12',
          action: 'h-14 px-4 text-sm',
        },
        tablet: {
          default: 'h-12 text-sm',
          small: 'h-10 text-sm',
          large: 'h-14 text-base',
          icon: 'h-11 w-11',
          action: 'h-12 px-5 text-sm',
        },
        desktop: {
          default: 'h-11 text-sm',
          small: 'h-9 text-xs',
          large: 'h-12 text-base',
          icon: 'h-10 w-10',
          action: 'h-11 px-6 text-sm',
        },
        'large-desktop': {
          default: 'h-10 text-sm',
          small: 'h-8 text-xs',
          large: 'h-12 text-base',
          icon: 'h-10 w-10',
          action: 'h-11 px-6 text-sm',
        }
      };
      return sizes[posMode]?.[variant] || sizes.desktop[variant];
    };
    
    // Font sizes
    const getFontSize = (variant = 'base') => {
      const sizes = {
        mobile: {
          xs: 'text-xs',
          sm: 'text-sm',
          base: 'text-base',
          lg: 'text-lg',
          xl: 'text-xl',
          '2xl': 'text-2xl',
          '3xl': 'text-3xl',
          title: 'text-xl',
          subtitle: 'text-sm',
        },
        tablet: {
          xs: 'text-[10px]',
          sm: 'text-xs',
          base: 'text-sm',
          lg: 'text-base',
          xl: 'text-lg',
          '2xl': 'text-xl',
          '3xl': 'text-2xl',
          title: 'text-lg',
          subtitle: 'text-xs',
        },
        desktop: {
          xs: 'text-[10px]',
          sm: 'text-xs',
          base: 'text-sm',
          lg: 'text-base',
          xl: 'text-lg',
          '2xl': 'text-xl',
          '3xl': 'text-2xl',
          title: 'text-xl',
          subtitle: 'text-xs',
        },
        'large-desktop': {
          xs: 'text-xs',
          sm: 'text-sm',
          base: 'text-sm',
          lg: 'text-base',
          xl: 'text-lg',
          '2xl': 'text-xl',
          '3xl': 'text-2xl',
          title: 'text-xl',
          subtitle: 'text-sm',
        }
      };
      return sizes[posMode]?.[variant] || sizes.desktop[variant];
    };
    
    // Spacing
    const getSpacing = (variant = 'default') => {
      const spacings = {
        mobile: {
          default: 'p-3 gap-2',
          tight: 'p-2 gap-1',
          loose: 'p-4 gap-3',
          section: 'p-4',
          card: 'p-3',
        },
        tablet: {
          default: 'p-3 gap-2',
          tight: 'p-2 gap-1.5',
          loose: 'p-4 gap-3',
          section: 'p-4',
          card: 'p-3',
        },
        desktop: {
          default: 'p-4 gap-3',
          tight: 'p-2 gap-2',
          loose: 'p-6 gap-4',
          section: 'p-6',
          card: 'p-4',
        },
        'large-desktop': {
          default: 'p-4 gap-4',
          tight: 'p-3 gap-2',
          loose: 'p-6 gap-4',
          section: 'p-6',
          card: 'p-4',
        }
      };
      return spacings[posMode]?.[variant] || spacings.desktop[variant];
    };
    
    // Layout helpers for specific screens
    const getLayout = (screen) => {
      const layouts = {
        orderScreen: {
          mobile: {
            direction: 'flex-col',
            menuWidth: 'w-full',
            cartWidth: 'w-full',
            cartPosition: 'fixed bottom-0 left-0 right-0',
            showSidebar: false,
            categoriesPosition: 'top',
          },
          tablet: {
            direction: isLandscape ? 'flex-row' : 'flex-col',
            menuWidth: isLandscape ? 'flex-1' : 'w-full',
            cartWidth: isLandscape ? 'w-80' : 'w-full',
            cartPosition: isLandscape ? 'relative' : 'fixed bottom-0 left-0 right-0',
            showSidebar: isLandscape,
            categoriesPosition: 'top',
          },
          desktop: {
            direction: 'flex-row',
            menuWidth: 'flex-1',
            cartWidth: 'w-96',
            cartPosition: 'relative',
            showSidebar: true,
            categoriesPosition: 'left',
          },
          'large-desktop': {
            direction: 'flex-row',
            menuWidth: 'flex-1',
            cartWidth: 'w-[420px]',
            cartPosition: 'relative',
            showSidebar: true,
            categoriesPosition: 'left',
          }
        },
        paymentScreen: {
          mobile: {
            direction: 'flex-col',
            detailsWidth: 'w-full',
            methodsWidth: 'w-full',
            methodCols: 2,
            quickAmountsCols: 3,
          },
          tablet: {
            direction: isLandscape ? 'flex-row' : 'flex-col',
            detailsWidth: isLandscape ? 'w-72' : 'w-full',
            methodsWidth: isLandscape ? 'flex-1' : 'w-full',
            methodCols: isLandscape ? 3 : 2,
            quickAmountsCols: isLandscape ? 1 : 3,
          },
          desktop: {
            direction: 'flex-row',
            detailsWidth: 'w-80',
            methodsWidth: 'flex-1',
            methodCols: 3,
            quickAmountsCols: 1,
          },
          'large-desktop': {
            direction: 'flex-row',
            detailsWidth: 'w-96',
            methodsWidth: 'flex-1',
            methodCols: 3,
            quickAmountsCols: 1,
          }
        },
        tableMap: {
          mobile: {
            tableMinSize: 60,
            tableMaxSize: 100,
            showAreaTabs: true,
            areaTabsPosition: 'top',
            fontSize: 'text-xs',
          },
          tablet: {
            tableMinSize: 70,
            tableMaxSize: 120,
            showAreaTabs: true,
            areaTabsPosition: 'top',
            fontSize: 'text-sm',
          },
          desktop: {
            tableMinSize: 80,
            tableMaxSize: 150,
            showAreaTabs: true,
            areaTabsPosition: 'top',
            fontSize: 'text-sm',
          },
          'large-desktop': {
            tableMinSize: 90,
            tableMaxSize: 180,
            showAreaTabs: true,
            areaTabsPosition: 'top',
            fontSize: 'text-base',
          }
        }
      };
      return layouts[screen]?.[posMode] || layouts[screen]?.desktop;
    };
    
    return {
      // Device info
      isMobile,
      isTablet,
      isDesktop,
      isIOS,
      isAndroid,
      isTouchDevice,
      
      // Orientation
      isLandscape,
      isPortrait,
      
      // Screen sizes
      isXSmall,
      isSmall,
      isMedium,
      isLarge,
      isXLarge,
      
      // Dimensions
      screenWidth: width,
      screenHeight: height,
      
      // POS mode
      posMode,
      
      // Helper functions
      getGridCols,
      getButtonSize,
      getFontSize,
      getSpacing,
      getLayout,
      
      // Device label for debugging
      deviceLabel: `${posMode} (${width}x${height}) ${isLandscape ? 'landscape' : 'portrait'}`,
    };
  }, []);
  
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo);
  
  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo(getDeviceInfo());
    };
    
    // Debounced resize handler
    let timeoutId;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Initial check
    handleResize();
    
    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(timeoutId);
    };
  }, [getDeviceInfo]);
  
  return deviceInfo;
}

export default useDeviceDetect;

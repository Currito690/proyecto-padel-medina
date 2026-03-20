import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase';

export function useBookings() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch bookings for a specific date (YYYY-MM-DD)
  const getBookingsByDate = useCallback(async (date) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', date);

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createBooking = async (bookingData) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single();
        
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return { getBookingsByDate, createBooking, loading, error };
}

import axios from 'axios';

export const signupTenant = ({ outletName, ownerName, email, password }) =>
  axios.post(
    `${process.env.REACT_APP_API_URL}/api/auth/signup`,
    { outletName, ownerName, email, password },
    { withCredentials: true }
  );

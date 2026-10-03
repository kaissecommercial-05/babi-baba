import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth';

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';

import { auth, googleProvider, db } from './firebase';
import './App.css';

// Petit message flottant (remplace notify(), ne bloque pas l'écran)
function notify(message) {
  const toast = document.createElement('div');
  toast.textContent = message;

  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '90px',
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '12px 18px',
    borderRadius: '14px',
    fontSize: '14px',
    lineHeight: '1.4',
    zIndex: '99999',
    maxWidth: '90vw',
    textAlign: 'center',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)'
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

const CART_STORAGE_KEY = 'babibaba-cart';

function loadSavedCart() {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [cart, setCart] = useState(loadSavedCart);
  const [currentPage, setCurrentPage] = useState('home');

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // =====================================================
  // VENDEUR
  // =====================================================

  const [sellerInfo, setSellerInfo] = useState({
    shopName: '',
    description: '',
    location: '',
    phone: ''
  });

  const [sellerCreated, setSellerCreated] = useState(false);

  const [sellerProducts, setSellerProducts] = useState([]);

  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    description: '',
    category: '',
    quantity: '',
    image: ''
  });

  // =====================================================
  // COMMANDES VENDEUR / VENTES
  // =====================================================

  const [sellerOrders, setSellerOrders] = useState([]);

  // Une vente = une commande livrée
  const sellerSales = sellerOrders.filter(
    (order) => order.status === 'livree'
  );

  // Commandes passées par le client connecté
  const [orders, setOrders] = useState([]);

  const [paymentMethod, setPaymentMethod] =
    useState('orange');

  const [placingOrder, setPlacingOrder] =
    useState(false);

  // =====================================================
  // INFORMATIONS COMMANDE CLIENT
  // =====================================================

  const [orderInfo, setOrderInfo] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    deliveryZone: 'abidjan',
    delivery: 'standard',
    driverChoice: 'client',
    selectedDriver: ''
  });

  // =====================================================
  // LIVREURS DISPONIBLES
  // =====================================================

  const availableDrivers = [
    {
      id: 'driver-1',
      name: 'Ibrahim K.',
      zone: 'Cocody',
      rating: '4.9',
      deliveries: 128,
      emoji: '👨🏾'
    },
    {
      id: 'driver-2',
      name: 'Yannick A.',
      zone: 'Marcory',
      rating: '4.8',
      deliveries: 96,
      emoji: '👨🏿'
    },
    {
      id: 'driver-3',
      name: 'Mariam B.',
      zone: 'Yopougon',
      rating: '4.9',
      deliveries: 143,
      emoji: '👩🏾'
    }
  ];

  // =====================================================
  // AUTHENTIFICATION
  // =====================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);

        if (currentUser) {
          setOrderInfo((currentInfo) => ({
            ...currentInfo,
            name:
              currentInfo.name ||
              currentUser.displayName ||
              ''
          }));
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Sauvegarde du panier dans le navigateur
  useEffect(() => {
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );
    } catch {
      // stockage indisponible : on ignore
    }
  }, [cart]);

  // Chargement des 60 produits les plus récents
  const fetchProducts = async () => {
    try {
      const productsSnapshot = await getDocs(
        query(
          collection(db, 'products'),
          orderBy('createdAt', 'desc'),
          limit(60)
        )
      );

      const products = productsSnapshot.docs.map(
        (productDoc) => ({
          id: productDoc.id,
          ...productDoc.data()
        })
      );

      setSellerProducts(products);
    } catch (error) {
      console.error(
        'Erreur lors du chargement des produits :',
        error
      );
    }
  };

  // Chargement des commandes (achats + ventes)
  const loadOrders = async (currentUser) => {
    try {
      const byDateDesc = (list) =>
        list.sort((a, b) =>
          String(b.createdAt || '').localeCompare(
            String(a.createdAt || '')
          )
        );

      const [mineSnapshot, receivedSnapshot] =
        await Promise.all([
          getDocs(
            query(
              collection(db, 'orders'),
              where('buyerId', '==', currentUser.uid)
            )
          ),
          getDocs(
            query(
              collection(db, 'orders'),
              where(
                'sellerIds',
                'array-contains',
                currentUser.uid
              )
            )
          )
        ]);

      setOrders(
        byDateDesc(
          mineSnapshot.docs.map((orderDoc) => ({
            id: orderDoc.id,
            ...orderDoc.data()
          }))
        )
      );

      setSellerOrders(
        byDateDesc(
          receivedSnapshot.docs.map((orderDoc) => ({
            id: orderDoc.id,
            ...orderDoc.data()
          }))
        )
      );
    } catch (error) {
      console.error(
        'Erreur lors du chargement des commandes :',
        error
      );
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setSellerOrders([]);
      return;
    }

    loadOrders(user);
  }, [user]);

  useEffect(() => {
    const loadShop = async () => {
      if (!user) return;

      try {
        // On lit uniquement SA boutique (id = uid)
        const shopSnapshot = await getDoc(
          doc(db, 'shops', user.uid)
        );

        if (shopSnapshot.exists()) {
          const myShop = shopSnapshot.data();

          setSellerInfo({
            shopName: myShop.shopName || '',
            description: myShop.description || '',
            location: myShop.location || '',
            phone: myShop.phone || ''
          });

          setSellerCreated(true);
        }
      } catch (error) {
        console.error(
          'Erreur lors du chargement de la boutique :',
          error
        );
      }
    };

    loadShop();
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(
        'Erreur de connexion Google :',
        error
      );

      if (
        error.code ===
        'auth/popup-closed-by-user'
      ) {
        return;
      }

      notify(
        'La connexion avec Google a échoué. Veuillez réessayer.'
      );
    }
  };

  // =====================================================
  // PROFIL
  // =====================================================

  const handleProfileClick = () => {
    setProfileMenuOpen((value) => !value);
  };

  const goToProfile = () => {
    setProfileMenuOpen(false);
    setCurrentPage('profile');
  };

  const goToOrders = () => {
    setProfileMenuOpen(false);
    setCurrentPage('orders');
  };

  const goToSeller = () => {
    setProfileMenuOpen(false);

    if (sellerCreated) {
      setCurrentPage('seller-dashboard');
    } else {
      setCurrentPage('seller');
    }
  };

  // =====================================================
  // INFORMATIONS BOUTIQUE
  // =====================================================

  const handleSellerChange = (event) => {
    const { name, value } = event.target;

    setSellerInfo((currentInfo) => ({
      ...currentInfo,
      [name]: value
    }));
  };

  const handleCreateShop = async (event) => {
  event.preventDefault();

  if (
    !sellerInfo.shopName ||
    !sellerInfo.location ||
    !sellerInfo.phone
  ) {
    notify(
      'Veuillez renseigner le nom de la boutique, la localisation et le téléphone.'
    );
    return;
  }

  if (!user) {
    notify(
      'Vous devez être connecté pour créer une boutique.'
    );
    return;
  }

  try {
    await setDoc(
      doc(db, 'shops', user.uid),
      {
        ownerId: user.uid,
        ownerName: user.displayName || '',
        ownerEmail: user.email || '',
        shopName: sellerInfo.shopName,
        description: sellerInfo.description,
        location: sellerInfo.location,
        phone: sellerInfo.phone,
        createdAt: new Date().toISOString()
      }
    );

    setSellerCreated(true);
    setCurrentPage('seller-dashboard');

    notify('Votre boutique a été créée avec succès !');
  } catch (error) {
    console.error(
      'Erreur lors de la création de la boutique :',
      error
    );

    notify(
      'Impossible de créer la boutique pour le moment. Veuillez réessayer.'
    );
  }
};
  // =====================================================
  // PRODUITS VENDEUR
  // =====================================================

  const handleProductChange = (event) => {
    const { name, value } = event.target;

    setProductForm((currentProduct) => ({
      ...currentProduct,
      [name]: value
    }));
  };

  const handleProductImageChange = async (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    notify('Veuillez sélectionner une image.');
    return;
  }

  try {
    const authResponse = await fetch(
  '/.netlify/functions/imagekit-auth'
);

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      throw new Error(
        authData.error || 'Erreur d’authentification ImageKit'
      );
    }

    const formData = new FormData();

    formData.append('file', file);
    formData.append('fileName', file.name);
    formData.append('publicKey', 'public_Sqz0+cgZvi0D842i2Lb1MlHVTBw=');
    formData.append('token', authData.token);
    formData.append('expire', authData.expire);
    formData.append('signature', authData.signature);

    const uploadResponse = await fetch(
  'https://upload.imagekit.io/api/v1/files/upload',
  {
    method: 'POST',
    body: formData
  }
);

const uploadText = await uploadResponse.text();

console.log('Réponse ImageKit :', uploadText);

let uploadData;

try {
  uploadData = JSON.parse(uploadText);
} catch (error) {
  throw new Error(
    `ImageKit a renvoyé une réponse inattendue : ${uploadText.slice(0, 200)}`
  );
}

    if (!uploadResponse.ok) {
      throw new Error(
        uploadData.message || 'Erreur lors de l’envoi de l’image'
      );
    }

    setProductForm((currentProduct) => ({
      ...currentProduct,
      image: uploadData.url
    }));

    notify('Image envoyée avec succès !');
  } catch (error) {
    console.error(
      'Erreur lors de l’envoi de l’image :',
      error
    );

    notify(
      'Impossible d’envoyer l’image pour le moment.'
    );
  }
};


  const handlePublishProduct = async (event) => {
  event.preventDefault();

  if (
    !productForm.image ||
    !productForm.name ||
    !productForm.price ||
    !productForm.category ||
    !productForm.quantity
  ) {
    notify(
      'Veuillez ajouter une photo et renseigner toutes les informations obligatoires.'
    );
    return;
  }

  if (!user) {
    notify(
      'Vous devez être connecté pour publier un produit.'
    );
    return;
  }

  const newProduct = {
    id: `product-${Date.now()}`,
    name: productForm.name,
    price: Number(productForm.price),
    description: productForm.description,
    category: productForm.category,
    quantity: Number(productForm.quantity),
    image: productForm.image,
    shop: sellerInfo.shopName,
    location: sellerInfo.location,
    sellerPhone: sellerInfo.phone,
    sellerId: user.uid
  };

  try {
    await setDoc(
  doc(db, 'products', newProduct.id),
  {
    name: newProduct.name,
    price: newProduct.price,
    description: newProduct.description,
    category: newProduct.category,
    quantity: newProduct.quantity,
    shop: newProduct.shop,
    location: newProduct.location,
    sellerPhone: newProduct.sellerPhone,
    image: newProduct.image,
    sellerId: user.uid,
    createdAt: new Date().toISOString()
  }
);

    setSellerProducts((currentProducts) => [
      ...currentProducts,
      newProduct
    ]);

    setProductForm({
      name: '',
      price: '',
      description: '',
      category: '',
      quantity: '',
      image: ''
    });

    setCurrentPage('seller-products');

    notify('Produit publié avec succès !');
  } catch (error) {
    console.error(
      'Erreur lors de la publication du produit :',
      error
    );

    notify(
      'Impossible de publier le produit pour le moment.'
    );
  }
}

  // Combien d'exemplaires de ce produit sont déjà au panier
  const countInCart = (product) =>
    product.id
      ? cart.filter((item) => item.id === product.id)
          .length
      : 0;

  const addSellerProductToCart = (product) => {
    if (product.quantity <= 0) {
      notify(
        'Cet article est actuellement en rupture de stock.'
      );
      return;
    }

    if (countInCart(product) >= product.quantity) {
      notify(
        `Stock maximum atteint pour ${product.name} (${product.quantity} disponible${
          product.quantity > 1 ? 's' : ''
        }).`
      );
      return;
    }

    setCart((currentCart) => [
      ...currentCart,
      product
    ]);

    notify(
      `${product.name} a été ajouté au panier.`
    );
  };

  // =====================================================
  // PRODUITS DU VENDEUR CONNECTÉ
  // =====================================================

  const mySellerProducts = sellerProducts.filter(
    (product) => product.sellerId === user?.uid
  );

  const handleDeleteProduct = async (product) => {
    if (!user) {
      notify(
        'Vous devez être connecté pour supprimer un produit.'
      );
      return;
    }

    if (product.sellerId !== user.uid) {
      notify(
        'Vous ne pouvez supprimer que vos propres produits.'
      );
      return;
    }

    const confirmed = window.confirm(
      `Voulez-vous vraiment supprimer "${product.name}" ?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, 'products', product.id)
      );

      setSellerProducts((currentProducts) =>
        currentProducts.filter(
          (currentProduct) =>
            currentProduct.id !== product.id
        )
      );

      notify('Produit supprimé avec succès.');
    } catch (error) {
      console.error(
        'Erreur lors de la suppression du produit :',
        error
      );

      notify(
        'Impossible de supprimer le produit pour le moment.'
      );
    }
  };

  // =====================================================
  // NAVIGATION VENDEUR
  // =====================================================

  const goToSellerDashboard = () => {
    setCurrentPage('seller-dashboard');
  };

  const goToSellerShop = () => {
    setCurrentPage('seller-shop');
  };

  const goToSellerProducts = () => {
    setCurrentPage('seller-products');
  };

  const goToSellerOrders = () => {
    setCurrentPage('seller-orders');
  };

  const goToSellerSales = () => {
    setCurrentPage('seller-sales');
  };

  const goToSellerStats = () => {
    setCurrentPage('seller-stats');
  };

  const goToSellerSettings = () => {
    setCurrentPage('seller-settings');
  };

  const goToAddProduct = () => {
    setCurrentPage('add-product');
  };

  // =====================================================
  // DÉCONNEXION
  // =====================================================

  const handleLogoutClick = () => {
    setProfileMenuOpen(false);
    setLogoutConfirmOpen(true);
  };

  const handleCancelLogout = () => {
    setLogoutConfirmOpen(false);
  };

  const handleConfirmLogout = async () => {
    try {
      await signOut(auth);

      setUser(null);
      setCart([]);
      setCurrentPage('home');
      setProfileMenuOpen(false);
      setLogoutConfirmOpen(false);

      setOrderInfo({
        name: '',
        phone: '',
        address: '',
        city: '',
        deliveryZone: 'abidjan',
        delivery: 'standard',
        driverChoice: 'client',
        selectedDriver: ''
      });
    } catch (error) {
      console.error(
        'Erreur de déconnexion :',
        error
      );

      notify(
        'Impossible de vous déconnecter pour le moment.'
      );
    }
  };

  // =====================================================
  // PANIER
  // =====================================================

  const addToCart = (product) => {
    if (
      product.id &&
      product.quantity !== undefined &&
      countInCart(product) >= product.quantity
    ) {
      notify('Stock maximum atteint pour ce produit.');
      return;
    }

    setCart((currentCart) => [
      ...currentCart,
      product
    ]);
  };

  const removeFromCart = (indexToRemove) => {
    setCart((currentCart) =>
      currentCart.filter(
        (_, index) => index !== indexToRemove
      )
    );
  };

  const cartTotal = cart.reduce(
    (total, product) =>
      total + Number(product.price || 0),
    0
  );

  // =====================================================
  // LIVRAISON
  // =====================================================

  const getDeliveryFee = () => {
    if (
      orderInfo.deliveryZone === 'abidjan'
    ) {
      return orderInfo.delivery === 'express'
        ? 3000
        : 1500;
    }

    return orderInfo.delivery === 'express'
      ? 5000
      : 3500;
  };

  const deliveryFee = getDeliveryFee();

  const orderTotal =
    cartTotal + deliveryFee;

  // =====================================================
  // LIVREUR
  // =====================================================

  const selectedDriver =
    availableDrivers.find(
      (driver) =>
        driver.id ===
        orderInfo.selectedDriver
    );

  const handleDriverChoiceChange = (
    choice
  ) => {
    setOrderInfo((currentInfo) => ({
      ...currentInfo,
      driverChoice: choice,
      selectedDriver:
        choice === 'client'
          ? currentInfo.selectedDriver
          : ''
    }));
  };

  const handleDriverSelect = (
    driverId
  ) => {
    setOrderInfo((currentInfo) => ({
      ...currentInfo,
      selectedDriver: driverId
    }));
  };

  // =====================================================
  // COMMANDES (enregistrement + baisse du stock)
  // =====================================================

  const paymentLabels = {
    orange: 'Orange Money',
    mtn: 'MTN Mobile Money',
    wave: 'Wave'
  };

  const orderStatusLabels = {
    nouvelle: '🆕 Nouvelle',
    en_livraison: '🚚 En livraison',
    livree: '✅ Livrée'
  };

  const handlePlaceOrder = async () => {
    if (placingOrder) return;

    if (!user) {
      notify('Vous devez être connecté pour commander.');
      return;
    }

    if (cart.length === 0) {
      notify('Votre panier est vide.');
      return;
    }

    setPlacingOrder(true);

    try {
      // Regrouper les articles identiques
      const grouped = {};

      cart.forEach((item) => {
        const key = item.id || `demo:${item.name}`;

        if (grouped[key]) {
          grouped[key].qty += 1;
        } else {
          grouped[key] = { item, qty: 1 };
        }
      });

      const entries = Object.values(grouped);
      const stockEntries = entries.filter(
        (entry) => entry.item.id
      );

      const orderRef = doc(collection(db, 'orders'));

      await runTransaction(db, async (transaction) => {
        // 1) Lire les produits (prix et stock réels)
        const snapshots = await Promise.all(
          stockEntries.map((entry) =>
            transaction.get(
              doc(db, 'products', entry.item.id)
            )
          )
        );

        const realProducts = {};

        snapshots.forEach((snapshot, index) => {
          const entry = stockEntries[index];

          if (!snapshot.exists()) {
            throw new Error(
              `« ${entry.item.name} » n'est plus disponible.`
            );
          }

          const data = snapshot.data();
          const stock = Number(data.quantity || 0);

          if (stock < entry.qty) {
            throw new Error(
              `Stock insuffisant pour « ${entry.item.name} » (${stock} restant).`
            );
          }

          realProducts[entry.item.id] = {
            ref: snapshot.ref,
            data,
            stock
          };
        });

        // 2) Construire les lignes de commande
        const items = entries.map((entry) => {
          const real = entry.item.id
            ? realProducts[entry.item.id].data
            : entry.item;

          return {
            productId: entry.item.id || null,
            name: real.name,
            price: Number(real.price || 0),
            qty: entry.qty,
            shop: real.shop || '',
            sellerId: real.sellerId || null,
            image: real.image || ''
          };
        });

        const itemsTotal = items.reduce(
          (total, item) =>
            total + item.price * item.qty,
          0
        );

        const sellerIds = [
          ...new Set(
            items
              .map((item) => item.sellerId)
              .filter(Boolean)
          )
        ];

        // 3) Baisser le stock
        stockEntries.forEach((entry) => {
          const real = realProducts[entry.item.id];

          transaction.update(real.ref, {
            quantity: real.stock - entry.qty
          });
        });

        // 4) Enregistrer la commande
        transaction.set(orderRef, {
          buyerId: user.uid,
          buyerName: orderInfo.name,
          buyerEmail: user.email || '',
          buyerPhone: orderInfo.phone,
          address: orderInfo.address,
          city: orderInfo.city,
          deliveryZone: orderInfo.deliveryZone,
          delivery: orderInfo.delivery,
          driverChoice: orderInfo.driverChoice,
          driverName: selectedDriver
            ? selectedDriver.name
            : '',
          items,
          sellerIds,
          itemsTotal,
          deliveryFee,
          total: itemsTotal + deliveryFee,
          paymentMethod,
          paymentStatus: 'en_attente',
          status: 'nouvelle',
          createdAt: new Date().toISOString()
        });
      });

      setCart([]);
      await Promise.all([
        fetchProducts(),
        loadOrders(user)
      ]);
      setCurrentPage('orders');

      notify('Commande enregistrée avec succès ! 🎉');
    } catch (error) {
      console.error(
        'Erreur lors de la commande :',
        error
      );

      notify(
        error.message &&
          error.message.includes('«')
          ? error.message
          : 'Impossible de passer la commande pour le moment.'
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleUpdateOrderStatus = async (
    order,
    newStatus
  ) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: newStatus
      });

      setSellerOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.id === order.id
            ? { ...currentOrder, status: newStatus }
            : currentOrder
        )
      );

      notify('Statut de la commande mis à jour.');
    } catch (error) {
      console.error(
        'Erreur de mise à jour de la commande :',
        error
      );

      notify('Impossible de mettre à jour la commande.');
    }
  };

  const renderOrderCard = (order, forSeller = false) => {
    const lines = forSeller
      ? (order.items || []).filter(
          (item) => item.sellerId === user?.uid
        )
      : order.items || [];

    const linesTotal = lines.reduce(
      (total, item) =>
        total +
        Number(item.price || 0) *
          Number(item.qty || 1),
      0
    );

    const orderDate = order.createdAt
      ? new Date(order.createdAt).toLocaleString('fr-FR')
      : '';

    return (
      <div
        key={order.id}
        style={{
          marginTop: '18px',
          padding: '20px',
          background: '#fff',
          borderRadius: '18px',
          border: '1px solid #eee',
          textAlign: 'left',
          boxShadow: '0 6px 20px rgba(0,0,0,0.05)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px'
          }}
        >
          <strong>
            {orderStatusLabels[order.status] ||
              order.status}
          </strong>

          <span style={{ color: '#777', fontSize: '13px' }}>
            {orderDate}
          </span>
        </div>

        {lines.map((item, index) => (
          <div
            key={`${order.id}-${index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '6px 0',
              borderBottom: '1px solid #f3f3f3'
            }}
          >
            <span>
              {item.name} × {item.qty}
            </span>

            <span>
              {(
                Number(item.price || 0) *
                Number(item.qty || 1)
              ).toLocaleString('fr-FR')}{' '}
              FCFA
            </span>
          </div>
        ))}

        {forSeller ? (
          <div
            style={{
              marginTop: '12px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#444'
            }}
          >
            <div>
              <strong>Client :</strong> {order.buyerName}{' '}
              — {order.buyerPhone}
            </div>

            <div>
              <strong>Livraison :</strong> {order.address},{' '}
              {order.city}
            </div>

            <div>
              <strong>Total de vos articles :</strong>{' '}
              {linesTotal.toLocaleString('fr-FR')} FCFA
            </div>

            <div style={{ marginTop: '12px' }}>
              {order.status === 'nouvelle' && (
                <button
                  className="cart-button"
                  onClick={() =>
                    handleUpdateOrderStatus(
                      order,
                      'en_livraison'
                    )
                  }
                >
                  🚚 Marquer en livraison
                </button>
              )}

              {order.status === 'en_livraison' && (
                <button
                  className="cart-button"
                  onClick={() =>
                    handleUpdateOrderStatus(
                      order,
                      'livree'
                    )
                  }
                >
                  ✅ Marquer comme livrée
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: '12px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#444'
            }}
          >
            <div>
              Livraison : {order.deliveryFee?.toLocaleString('fr-FR')} FCFA
            </div>

            <div>
              Paiement :{' '}
              {paymentLabels[order.paymentMethod] ||
                order.paymentMethod}{' '}
              (à régler avec le vendeur)
            </div>

            <div
              style={{
                marginTop: '6px',
                fontSize: '16px'
              }}
            >
              <strong>
                Total : {Number(order.total || 0).toLocaleString('fr-FR')} FCFA
              </strong>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================================
  // NAVIGATION CLIENT
  // =====================================================

  const goToHome = () => {
    setProfileMenuOpen(false);
    setCurrentPage('home');
  };

  const goToCart = () => {
    setProfileMenuOpen(false);
    setCurrentPage('cart');
  };

  const goToOrder = () => {
    setProfileMenuOpen(false);

    if (cart.length === 0) {
      notify('Votre panier est vide.');
      return;
    }

    setCurrentPage('order');
  };

  const goToPayment = () => {
    setProfileMenuOpen(false);

    if (
      !orderInfo.name ||
      !orderInfo.phone
    ) {
      notify(
        'Veuillez renseigner votre nom et votre numéro de téléphone.'
      );
      return;
    }

    if (
      !orderInfo.city ||
      !orderInfo.address
    ) {
      notify(
        'Veuillez renseigner votre ville et votre adresse de livraison.'
      );
      return;
    }

    if (
      orderInfo.driverChoice === 'client' &&
      !orderInfo.selectedDriver
    ) {
      notify(
        'Veuillez choisir un livreur ou sélectionner « Le commerçant choisit ».'
      );
      return;
    }

    setCurrentPage('payment');
  };

  const handleOrderChange = (event) => {
    const {
      name,
      value
    } = event.target;

    setOrderInfo((currentInfo) => ({
      ...currentInfo,
      [name]: value
    }));
  };

  // =====================================================
  // PRODUITS
  // =====================================================

  const getProductEmoji = (
    productName
  ) => {
    if (
      productName ===
      'Basket tendance'
    )
      return '👟';

    if (
      productName ===
      'Smartphone Android'
    )
      return '📱';

    if (
      productName ===
      'Robe élégante'
    )
      return '👗';

    if (
      productName ===
      'Casque Bluetooth'
    )
      return '🎧';

    return '📦';
  };

  // =====================================================
  // BOUTON PROFIL
  // =====================================================

  const ProfileButton = ({
    mobile = false
  }) => {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex'
        }}
      >
        <button
          title="Mon profil"
          onClick={handleProfileClick}
        >
          <span>👤</span>

          {mobile && (
            <small>Profil</small>
          )}
        </button>

        {profileMenuOpen && (
          <div
            style={{
              position: 'absolute',
              ...(mobile
                ? {
                    right: 0,
                    bottom:
                      'calc(100% + 12px)'
                  }
                : {
                    right: 0,
                    top:
                      'calc(100% + 12px)'
                  }),
              width: '280px',
              maxWidth:
                'calc(100vw - 24px)',
              background: '#fff',
              borderRadius: '16px',
              padding: '14px',
              boxShadow:
                '0 18px 50px rgba(0,0,0,0.18)',
              border: '1px solid #eee',
              zIndex: 1500
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding:
                  '8px 6px 14px',
                borderBottom:
                  '1px solid #eee'
              }}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profil"
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                      'center',
                    fontSize: '22px'
                  }}
                >
                  👤
                </div>
              )}

              <div
                style={{
                  minWidth: 0,
                  textAlign: 'left'
                }}
              >
                <strong
                  style={{
                    display: 'block',
                    color: '#111',
                    fontSize: '14px',
                    marginBottom: '4px',
                    whiteSpace:
                      'nowrap',
                    overflow: 'hidden',
                    textOverflow:
                      'ellipsis'
                  }}
                >
                  {user?.displayName ||
                    'Utilisateur'}
                </strong>

                <span
                  style={{
                    display: 'block',
                    color: '#777',
                    fontSize: '12px',
                    whiteSpace:
                      'nowrap',
                    overflow: 'hidden',
                    textOverflow:
                      'ellipsis'
                  }}
                >
                  {user?.email || ''}
                </span>
              </div>
            </div>

            <button
              onClick={goToProfile}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '12px',
                border: 'none',
                borderRadius: '10px',
                background: '#f7f7f7',
                color: '#222',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              👤 Mon profil
            </button>

            {sellerCreated && (
              <button
                onClick={goToSellerDashboard}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '12px',
                  border: 'none',
                  borderRadius: '10px',
                  background: '#fff7ed',
                  color: '#f97316',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                🏪 Tableau de bord vendeur
              </button>
            )}

            <button
              onClick={handleLogoutClick}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '12px',
                border: 'none',
                borderRadius: '10px',
                background: '#fff1f1',
                color: '#d93025',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              🚪 Déconnexion
            </button>
          </div>
        )}
      </div>
    );
  };

  // =====================================================
  // HEADER COMMUN
  // =====================================================

  const MainHeader = () => {
    return (
      <header className="main-header">
        <div className="header-top">
          <div
            className="logo"
            onClick={goToHome}
            style={{
              cursor: 'pointer'
            }}
          >
            <span className="logo-icon">
              🐘
            </span>

            <span>BABI-BABA</span>
          </div>

          <div className="header-actions">
            <button>❤️</button>

            <button>🔔</button>

            <button
              className="cart-icon"
              onClick={goToCart}
            >
              🛒

              {cart.length > 0 && (
                <span className="cart-count">
                  {cart.length}
                </span>
              )}
            </button>

            <ProfileButton />
          </div>
        </div>
      </header>
    );
  };

  // =====================================================
  // CARTE DASHBOARD VENDEUR
  // =====================================================

  const SellerDashboardCard = ({
    icon,
    title,
    description,
    onClick
  }) => {
    return (
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '24px',
          border: '1px solid #eee',
          borderRadius: '20px',
          background: '#fff',
          textAlign: 'left',
          cursor: 'pointer',
          transition:
            'transform 0.2s ease, box-shadow 0.2s ease',
          boxShadow:
            '0 8px 25px rgba(0,0,0,0.04)'
        }}
      >
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: '#fff3e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '27px',
            marginBottom: '16px'
          }}
        >
          {icon}
        </div>

        <strong
          style={{
            display: 'block',
            color: '#111',
            fontSize: '18px',
            marginBottom: '7px'
          }}
        >
          {title}
        </strong>

        <span
          style={{
            display: 'block',
            color: '#777',
            fontSize: '13px',
            lineHeight: '1.5'
          }}
        >
          {description}
        </span>

        <span
          style={{
            display: 'inline-block',
            marginTop: '16px',
            color: '#f97316',
            fontSize: '13px',
            fontWeight: '700'
          }}
        >
          Ouvrir →
        </span>
      </button>
    );
  };

  // =====================================================
  // MODALE DÉCONNEXION
  // =====================================================

  const LogoutConfirmation = () => {
    if (!logoutConfirmOpen)
      return null;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background:
            'rgba(0,0,0,0.48)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 3000
        }}
        onClick={handleCancelLogout}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: '#fff',
            borderRadius: '22px',
            padding: '30px',
            boxShadow:
              '0 25px 80px rgba(0,0,0,0.25)',
            textAlign: 'center'
          }}
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div
            style={{
              width: '62px',
              height: '62px',
              margin:
                '0 auto 16px',
              borderRadius: '50%',
              background: '#fff1f1',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              fontSize: '28px'
            }}
          >
            🚪
          </div>

          <h2
            style={{
              margin: '0 0 10px',
              color: '#111',
              fontSize: '22px'
            }}
          >
            Se déconnecter ?
          </h2>

          <p
            style={{
              margin:
                '0 0 24px',
              color: '#666',
              lineHeight: '1.5',
              fontSize: '14px'
            }}
          >
            Voulez-vous vraiment
            vous déconnecter de
            BABI-BABA ?
          </p>

          <div
            style={{
              display: 'flex',
              gap: '10px'
            }}
          >
            <button
              onClick={
                handleCancelLogout
              }
              style={{
                flex: 1,
                padding:
                  '13px 10px',
                border:
                  '1px solid #ddd',
                borderRadius: '10px',
                background: '#fff',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>

            <button
              onClick={
                handleConfirmLogout
              }
              style={{
                flex: 1,
                padding:
                  '13px 10px',
                border: 'none',
                borderRadius: '10px',
                background: '#d93025',
                color: '#fff',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =====================================================
  // CHARGEMENT
  // =====================================================

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems:
            'center',
          justifyContent:
            'center',
          background: '#f7f7f7',
          padding: '20px'
        }}
      >
        <div
          style={{
            textAlign: 'center',
            background: '#fff',
            padding: '35px',
            borderRadius: '20px',
            boxShadow:
              '0 15px 45px rgba(0,0,0,0.08)'
          }}
        >
          <div
            style={{
              fontSize: '50px',
              marginBottom: '15px'
            }}
          >
            🐘
          </div>

          <h2>BABI-BABA</h2>

          <p
            style={{
              color: '#777'
            }}
          >
            Chargement...
          </p>
        </div>
      </div>
    );
  }

  // =====================================================
  // CONNEXION GOOGLE
  // =====================================================

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems:
            'center',
          justifyContent:
            'center',
          background:
            'linear-gradient(135deg,#fff7ed 0%,#fff 50%,#f7f7f7 100%)',
          padding: '20px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            background: '#fff',
            borderRadius: '24px',
            padding: '40px 30px',
            textAlign: 'center',
            boxShadow:
              '0 20px 60px rgba(0,0,0,0.10)'
          }}
        >
          <div
            style={{
              fontSize: '65px',
              marginBottom: '10px'
            }}
          >
            🐘
          </div>

          <h1
            style={{
              margin:
                '0 0 10px',
              color: '#111',
              fontSize: '30px'
            }}
          >
            BABI-BABA
          </h1>

          <p
            style={{
              color: '#666',
              lineHeight: '1.6',
              marginBottom: '30px'
            }}
          >
            Le marché ivoirien,
            <br />
            directement dans
            votre poche.
          </p>

          <button
            onClick={
              handleGoogleLogin
            }
            style={{
              width: '100%',
              padding:
                '16px 20px',
              border:
                '1px solid #ddd',
              borderRadius: '12px',
              background: '#fff',
              color: '#222',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow:
                '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            🇬 &nbsp; Continuer avec Google
          </button>

          <p
            style={{
              marginTop: '25px',
              fontSize: '13px',
              color: '#999'
            }}
          >
            Connectez-vous pour
            accéder à BABI-BABA.
          </p>
        </div>
      </div>
    );
  }

  // =====================================================
  // PAGE PROFIL
  // =====================================================

  if (
    currentPage ===
    'profile'
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={goToHome}
          >
            ← Retour à l'accueil
          </button>

          <div
            style={{
              marginTop: '25px',
              background: '#fff',
              borderRadius: '24px',
              padding: '30px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.08)',
              border:
                '1px solid #eee'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems:
                  'center',
                gap: '20px',
                flexWrap: 'wrap',
                paddingBottom:
                  '25px',
                borderBottom:
                  '1px solid #eee'
              }}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Photo de profil"
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius:
                      '50%',
                    objectFit:
                      'cover'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius:
                      '50%',
                    background:
                      '#f5f5f5',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    fontSize: '40px'
                  }}
                >
                  👤
                </div>
              )}

              <div>
                <span
                  style={{
                    display:
                      'inline-block',
                    background:
                      '#fff3e8',
                    color:
                      '#f97316',
                    padding:
                      '6px 10px',
                    borderRadius:
                      '20px',
                    fontSize:
                      '12px',
                    fontWeight:
                      '700',
                    marginBottom:
                      '8px'
                  }}
                >
                  👤 MON PROFIL
                </span>

                <h1
                  style={{
                    margin:
                      '0 0 6px',
                    color: '#111',
                    fontSize:
                      '28px'
                  }}
                >
                  {user.displayName ||
                    'Utilisateur'}
                </h1>

                <p
                  style={{
                    margin: 0,
                    color: '#777'
                  }}
                >
                  📧 {user.email}
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: '25px'
              }}
            >
              <h2
                style={{
                  marginBottom:
                    '18px',
                  color: '#111'
                }}
              >
                Mon espace
              </h2>

              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit,minmax(220px,1fr))',
                  gap: '15px'
                }}
              >
                <button
                  onClick={
                    goToSeller
                  }
                  style={{
                    padding:
                      '20px',
                    border:
                      '1px solid #eee',
                    borderRadius:
                      '16px',
                    background:
                      '#fff',
                    textAlign:
                      'left',
                    cursor:
                      'pointer'
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        '28px'
                    }}
                  >
                    🏪
                  </div>

                  <strong
                    style={{
                      display:
                        'block',
                      marginTop:
                        '10px',
                      fontSize:
                        '16px',
                      color:
                        '#111'
                    }}
                  >
                    {sellerCreated
                      ? 'Tableau de bord vendeur'
                      : 'Devenir vendeur'}
                  </strong>

                  <span
                    style={{
                      display:
                        'block',
                      marginTop:
                        '5px',
                      color:
                        '#777',
                      fontSize:
                        '13px'
                    }}
                  >
                    {sellerCreated
                      ? 'Gérez votre boutique et votre activité.'
                      : 'Créez votre boutique BABI-BABA.'}
                  </span>
                </button>

                <button
                  style={{
                    padding:
                      '20px',
                    border:
                      '1px solid #eee',
                    borderRadius:
                      '16px',
                    background:
                      '#fff',
                    textAlign:
                      'left',
                    cursor:
                      'pointer'
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        '28px'
                    }}
                  >
                    🚚
                  </div>

                  <strong
                    style={{
                      display:
                        'block',
                      marginTop:
                        '10px',
                      fontSize:
                        '16px',
                      color:
                        '#111'
                    }}
                  >
                    Devenir livreur
                  </strong>

                  <span
                    style={{
                      display:
                        'block',
                      marginTop:
                        '5px',
                      color:
                        '#777',
                      fontSize:
                        '13px'
                    }}
                  >
                    Rejoignez le réseau de livraison.
                  </span>
                </button>

                <button
                  style={{
                    padding:
                      '20px',
                    border:
                      '1px solid #eee',
                    borderRadius:
                      '16px',
                    background:
                      '#fff',
                    textAlign:
                      'left',
                    cursor:
                      'pointer'
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        '28px'
                    }}
                  >
                    ⚙️
                  </div>

                  <strong
                    style={{
                      display:
                        'block',
                      marginTop:
                        '10px',
                      fontSize:
                        '16px',
                      color:
                        '#111'
                    }}
                  >
                    Paramètres
                  </strong>

                  <span
                    style={{
                      display:
                        'block',
                      marginTop:
                        '5px',
                      color:
                        '#777',
                      fontSize:
                        '13px'
                    }}
                  >
                    Gérez votre compte.
                  </span>
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop:
                  '30px',
                paddingTop:
                  '25px',
                borderTop:
                  '1px solid #eee'
              }}
            >
              <button
                onClick={
                  handleLogoutClick
                }
                style={{
                  width: '100%',
                  padding:
                    '14px',
                  border: 'none',
                  borderRadius:
                    '12px',
                  background:
                    '#fff1f1',
                  color:
                    '#d93025',
                  fontWeight:
                    '700',
                  cursor:
                    'pointer'
                }}
              >
                🚪 Se déconnecter
              </button>
            </div>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE DEVENIR VENDEUR / CRÉATION BOUTIQUE
  // =====================================================

  if (
    currentPage === 'seller' &&
    !sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={goToProfile}
          >
            ← Retour au profil
          </button>

          <div
            style={{
              marginTop: '25px',
              background: '#fff',
              borderRadius: '24px',
              padding: '30px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.08)',
              border:
                '1px solid #eee'
            }}
          >
            <div
              style={{
                textAlign:
                  'center',
                marginBottom:
                  '30px'
              }}
            >
              <span
                style={{
                  display:
                    'inline-block',
                  background:
                    '#fff3e8',
                  color:
                    '#f97316',
                  padding:
                    '7px 12px',
                  borderRadius:
                    '20px',
                  fontSize:
                    '12px',
                  fontWeight:
                    '700'
                }}
              >
                🏪 ESPACE VENDEUR
              </span>

              <h1
                style={{
                  margin:
                    '18px 0 10px',
                  color: '#111',
                  fontSize:
                    '30px'
                }}
              >
                Créer ma boutique
              </h1>

              <p
                style={{
                  margin:
                    '0 auto',
                  maxWidth:
                    '600px',
                  color: '#777',
                  lineHeight:
                    '1.6'
                }}
              >
                Présentez votre commerce
                sur BABI-BABA et
                commencez à vendre
                gratuitement.
              </p>
            </div>

            <form
              onSubmit={
                handleCreateShop
              }
            >
              <div className="form-group">
                <label>
                  Nom de la boutique
                </label>

                <input
                  type="text"
                  name="shopName"
                  value={
                    sellerInfo.shopName
                  }
                  onChange={
                    handleSellerChange
                  }
                  placeholder="Ex : Boutique Style CI"
                />
              </div>

              <div className="form-group">
                <label>
                  Description de la boutique
                </label>

                <textarea
                  name="description"
                  value={
                    sellerInfo.description
                  }
                  onChange={
                    handleSellerChange
                  }
                  placeholder="Présentez brièvement votre commerce et vos produits..."
                  rows="4"
                ></textarea>
              </div>

              <div className="form-group">
                <label>
                  Localisation
                </label>

                <input
                  type="text"
                  name="location"
                  value={
                    sellerInfo.location
                  }
                  onChange={
                    handleSellerChange
                  }
                  placeholder="Ex : Cocody, Abidjan"
                />
              </div>

              <div className="form-group">
                <label>
                  Téléphone professionnel
                </label>

                <input
                  type="tel"
                  name="phone"
                  value={
                    sellerInfo.phone
                  }
                  onChange={
                    handleSellerChange
                  }
                  placeholder="Ex : 07 00 00 00 00"
                />
              </div>

              <div
                style={{
                  marginTop:
                    '25px',
                  padding: '16px',
                  borderRadius:
                    '14px',
                  background:
                    '#fff7ed',
                  border:
                    '1px solid #fed7aa',
                  color:
                    '#7c2d12',
                  lineHeight:
                    '1.5',
                  fontSize:
                    '14px'
                }}
              >
                💡 La création de votre
                boutique est gratuite.
                Vous pourrez ensuite
                ajouter vos produits et
                les présenter aux clients
                de BABI-BABA.
              </div>

              <button
                type="submit"
                className="checkout-button"
                style={{
                  marginTop:
                    '25px'
                }}
              >
                🏪 Créer ma boutique
              </button>
            </form>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // TABLEAU DE BORD VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-dashboard' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1100px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={goToProfile}
          >
            ← Retour au profil
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                'linear-gradient(135deg,#fff7ed,#fff)',
              border:
                '1px solid #fed7aa',
              borderRadius:
                '24px',
              padding:
                '30px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.06)'
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                gap:
                  '20px',
                flexWrap:
                  'wrap'
              }}
            >
              <div>
                <span
                  style={{
                    display:
                      'inline-block',
                    background:
                      '#fff3e8',
                    color:
                      '#f97316',
                    padding:
                      '7px 12px',
                    borderRadius:
                      '20px',
                    fontSize:
                      '12px',
                    fontWeight:
                      '700'
                  }}
                >
                  🏪 ESPACE VENDEUR
                </span>

                <h1
                  style={{
                    margin:
                      '15px 0 8px',
                    color:
                      '#111',
                    fontSize:
                      '32px'
                  }}
                >
                  Tableau de bord vendeur
                </h1>

                <p
                  style={{
                    margin: 0,
                    color:
                      '#777',
                    lineHeight:
                      '1.6'
                  }}
                >
                  Bienvenue dans
                  votre espace
                  vendeur,
                  <strong>
                    {' '}
                    {sellerInfo.shopName}
                  </strong>
                  .
                </p>
              </div>

              <button
                className="checkout-button"
                onClick={
                  goToHome
                }
                style={{
                  marginTop: 0
                }}
              >
                🛍️ Voir BABI-BABA
              </button>
            </div>
          </div>

          <section
            style={{
              marginTop:
                '25px'
            }}
          >
            <h2
              style={{
                color:
                  '#111',
                marginBottom:
                  '18px'
              }}
            >
              Votre activité
            </h2>

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(260px,1fr))',
                gap:
                  '18px'
              }}
            >
              <SellerDashboardCard
                icon="🏪"
                title="Ma boutique"
                description="Consultez et gérez les informations de votre boutique."
                onClick={
                  goToSellerShop
                }
              />

              <SellerDashboardCard
                icon="📦"
                title="Mes produits"
                description={`Gérez vos articles et votre stock. ${mySellerProducts.length} produit(s) actuellement.`}
                onClick={
                  goToSellerProducts
                }
              />

              <SellerDashboardCard
                icon="🛒"
                title="Mes commandes"
                description="Retrouvez les commandes reçues par votre boutique."
                onClick={
                  goToSellerOrders
                }
              />

              <SellerDashboardCard
                icon="📊"
                title="Mes ventes"
                description="Consultez votre historique de ventes."
                onClick={
                  goToSellerSales
                }
              />

              <SellerDashboardCard
                icon="📈"
                title="Statistiques"
                description="Analysez l'activité et les performances de votre boutique."
                onClick={
                  goToSellerStats
                }
              />

              <SellerDashboardCard
                icon="⚙️"
                title="Paramètres"
                description="Gérez les informations et les réglages de votre boutique."
                onClick={
                  goToSellerSettings
                }
              />
            </div>
          </section>

          <section
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              border:
                '1px solid #eee',
              borderRadius:
                '20px',
              padding:
                '24px',
              boxShadow:
                '0 8px 25px rgba(0,0,0,0.04)'
            }}
          >
            <h2
              style={{
                margin:
                  '0 0 18px',
                color:
                  '#111'
              }}
            >
              📌 Aperçu rapide
            </h2>

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(180px,1fr))',
                gap:
                  '14px'
              }}
            >
              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <span
                  style={{
                    display:
                      'block',
                    color:
                      '#777',
                    fontSize:
                      '13px'
                  }}
                >
                  Produits
                </span>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '6px',
                    fontSize:
                      '25px',
                    color:
                      '#111'
                  }}
                >
                  {mySellerProducts.length}
                </strong>
              </div>

              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <span
                  style={{
                    display:
                      'block',
                    color:
                      '#777',
                    fontSize:
                      '13px'
                  }}
                >
                  Commandes
                </span>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '6px',
                    fontSize:
                      '25px',
                    color:
                      '#111'
                  }}
                >
                  {sellerOrders.length}
                </strong>
              </div>

              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <span
                  style={{
                    display:
                      'block',
                    color:
                      '#777',
                    fontSize:
                      '13px'
                  }}
                >
                  Ventes
                </span>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '6px',
                    fontSize:
                      '25px',
                    color:
                      '#111'
                  }}
                >
                  {sellerSales.length}
                </strong>
              </div>
            </div>
          </section>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // MA BOUTIQUE
  // =====================================================

  if (
    currentPage ===
      'seller-shop' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1000px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              borderRadius:
                '24px',
              padding:
                '30px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.08)',
              border:
                '1px solid #eee'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              🏪 MA BOUTIQUE
            </span>

            <h1
              style={{
                margin:
                  '18px 0 8px',
                color:
                  '#111'
              }}
            >
              {sellerInfo.shopName}
            </h1>

            <p
              style={{
                color:
                  '#777',
                lineHeight:
                  '1.6'
              }}
            >
              {sellerInfo.description ||
                'Aucune description renseignée pour le moment.'}
            </p>

            <div
              style={{
                marginTop:
                  '25px',
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(220px,1fr))',
                gap:
                  '15px'
              }}
            >
              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <strong>
                  📍 Localisation
                </strong>

                <p
                  style={{
                    color:
                      '#777',
                    marginBottom:
                      0
                  }}
                >
                  {sellerInfo.location}
                </p>
              </div>

              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <strong>
                  📞 Téléphone
                </strong>

                <p
                  style={{
                    color:
                      '#777',
                    marginBottom:
                      0
                  }}
                >
                  {sellerInfo.phone}
                </p>
              </div>

              <div
                style={{
                  padding:
                    '18px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '14px'
                }}
              >
                <strong>
                  📦 Produits
                </strong>

                <p
                  style={{
                    color:
                      '#777',
                    marginBottom:
                      0
                  }}
                >
                  {mySellerProducts.length}{' '}
                  produit
                  {mySellerProducts.length >
                  1
                    ? 's'
                    : ''}
                </p>
              </div>
            </div>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // MES PRODUITS VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-products' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1100px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px',
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap:
                '15px',
              flexWrap:
                'wrap'
            }}
          >
            <div>
              <span
                style={{
                  display:
                    'inline-block',
                  background:
                    '#fff3e8',
                  color:
                    '#f97316',
                  padding:
                    '7px 12px',
                  borderRadius:
                    '20px',
                  fontSize:
                    '12px',
                  fontWeight:
                    '700'
                }}
              >
                📦 MES PRODUITS
              </span>

              <h1
                style={{
                  margin:
                    '14px 0 5px',
                  color:
                    '#111'
                }}
              >
                Mes produits
              </h1>

              <p
                style={{
                  color:
                    '#777',
                  margin: 0
                }}
              >
                Gérez les articles de votre boutique.
              </p>
            </div>

            <button
              className="checkout-button"
              onClick={
                goToAddProduct
              }
              style={{
                marginTop: 0
              }}
            >
              ➕ Ajouter un article
            </button>
          </div>

          {mySellerProducts.length ===
          0 ? (
            <div
              style={{
                marginTop:
                  '25px',
                background:
                  '#fff',
                border:
                  '1px solid #eee',
                borderRadius:
                  '20px',
                padding:
                  '50px 20px',
                textAlign:
                  'center'
              }}
            >
              <div
                style={{
                  fontSize:
                    '55px'
                }}
              >
                📦
              </div>

              <h2
                style={{
                  color:
                    '#222'
                }}
              >
                Aucun produit
              </h2>

              <p
                style={{
                  color:
                    '#777'
                }}
              >
                Ajoutez votre premier article pour commencer à vendre.
              </p>

              <button
                className="checkout-button"
                onClick={
                  goToAddProduct
                }
              >
                📸 Ajouter mon premier article
              </button>
            </div>
          ) : (
            <div
              style={{
                marginTop:
                  '25px',
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(230px,1fr))',
                gap:
                  '18px'
              }}
            >
              {mySellerProducts.map(
                (product) => (
                  <div
                    key={
                      product.id
                    }
                    style={{
                      background:
                        '#fff',
                      border:
                        '1px solid #eee',
                      borderRadius:
                        '18px',
                      overflow:
                        'hidden',
                      boxShadow:
                        '0 8px 25px rgba(0,0,0,0.04)'
                    }}
                  >
                    <img
                      src={
                        product.image
                      }
                      alt={
                        product.name
                      }
                      style={{
                        width:
                          '100%',
                        height:
                          '210px',
                        objectFit:
                          'cover'
                      }}
                    />

                    <div
                      style={{
                        padding:
                          '16px'
                      }}
                    >
                      <h3
                        style={{
                          margin:
                            '0 0 7px',
                          color:
                            '#111'
                        }}
                      >
                        {
                          product.name
                        }
                      </h3>

                      <strong
                        style={{
                          color:
                            '#f97316',
                          fontSize:
                            '17px'
                        }}
                      >
                        {product.price.toLocaleString(
                          'fr-FR'
                        )}{' '}
                        FCFA
                      </strong>

                      <p
                        style={{
                          margin:
                            '9px 0 0',
                          color:
                            '#777',
                          fontSize:
                            '13px'
                        }}
                      >
                        📦 Stock :{' '}
                        {
                          product.quantity
                        }
                      </p>

                      <p
                        style={{
                          margin:
                            '5px 0 0',
                          color:
                            '#777',
                          fontSize:
                            '13px'
                        }}
                      >
                        📂{' '}
                        {
                          product.category
                        }
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteProduct(product)
                        }
                        style={{
                          width: '100%',
                          marginTop: '15px',
                          padding: '11px 14px',
                          border: 'none',
                          borderRadius: '10px',
                          background: '#fff1f1',
                          color: '#d93025',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Supprimer le produit
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // MES COMMANDES VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-orders' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1000px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              border:
                '1px solid #eee',
              borderRadius:
                '22px',
              padding:
                '35px 25px',
              textAlign:
                'center'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              🛒 MES COMMANDES
            </span>

            <h1
              style={{
                margin:
                  '18px 0 10px',
                color:
                  '#111'
              }}
            >
              Commandes reçues
            </h1>

            {sellerOrders.length ===
            0 ? (
              <div
                style={{
                  marginTop:
                    '30px',
                  padding:
                    '35px 20px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '18px',
                  border:
                    '1px dashed #ddd'
                }}
              >
                <div
                  style={{
                    fontSize:
                      '55px'
                  }}
                >
                  🛒
                </div>

                <h2>
                  Aucune commande pour le moment
                </h2>

                <p
                  style={{
                    color:
                      '#777',
                    lineHeight:
                      '1.6'
                  }}
                >
                  Les commandes passées par les clients sur vos produits apparaîtront ici.
                </p>
              </div>
            ) : (
              <div>
                {sellerOrders.map((order) =>
                  renderOrderCard(order, true)
                )}
              </div>
            )}
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // MES VENTES VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-sales' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1000px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              border:
                '1px solid #eee',
              borderRadius:
                '22px',
              padding:
                '35px 25px',
                textAlign:
                  'center'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              📊 MES VENTES
            </span>

            <h1
              style={{
                margin:
                  '18px 0 10px',
                color:
                  '#111'
              }}
            >
              Mes ventes
            </h1>

            <div
              style={{
                marginTop:
                  '30px',
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(200px,1fr))',
                gap:
                  '15px',
                textAlign:
                  'left'
              }}
            >
              <div
                style={{
                  padding:
                    '20px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '15px'
                }}
              >
                <span
                  style={{
                    color:
                      '#777',
                    fontSize:
                      '13px'
                  }}
                >
                  Nombre de ventes
                </span>

                <strong
                  style={{
                    display:
                      'block',
                    fontSize:
                      '28px',
                    marginTop:
                      '8px'
                  }}
                >
                  {sellerSales.length}
                </strong>
              </div>

              <div
                style={{
                  padding:
                    '20px',
                  background:
                    '#fafafa',
                  borderRadius:
                    '15px'
                }}
              >
                <span
                  style={{
                    color:
                      '#777',
                    fontSize:
                      '13px'
                  }}
                >
                  Chiffre d'affaires
                </span>

                <strong
                  style={{
                    display:
                      'block',
                    fontSize:
                      '24px',
                    marginTop:
                      '8px',
                    color:
                      '#f97316'
                  }}
                >
                  0 FCFA
                </strong>
              </div>
            </div>

            <div
              style={{
                marginTop:
                  '25px',
                padding:
                  '35px 20px',
                background:
                  '#fafafa',
                borderRadius:
                  '18px',
                border:
                  '1px dashed #ddd'
              }}
            >
              <div
                style={{
                  fontSize:
                    '50px'
                }}
              >
                📊
              </div>

              <h2>
                Votre historique de ventes apparaîtra ici
              </h2>

              <p
                style={{
                  color:
                    '#777',
                  lineHeight:
                    '1.6'
                }}
              >
                Cette partie sera connectée aux commandes et aux paiements réels.
              </p>
            </div>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // STATISTIQUES VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-stats' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1000px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              📈 STATISTIQUES
            </span>

            <h1
              style={{
                margin:
                  '15px 0 5px',
                color:
                  '#111'
              }}
            >
              Statistiques
            </h1>

            <p
              style={{
                color:
                  '#777'
              }}
            >
              Suivez les performances de votre boutique.
            </p>
          </div>

          <div
            style={{
              marginTop:
                '25px',
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(210px,1fr))',
              gap:
                '16px'
            }}
          >
            <div
              style={{
                background:
                  '#fff',
                border:
                  '1px solid #eee',
                borderRadius:
                  '18px',
                padding:
                  '22px'
              }}
            >
              <span
                style={{
                  color:
                    '#777',
                  fontSize:
                    '13px'
                }}
              >
                📦 Produits
              </span>

              <strong
                style={{
                  display:
                    'block',
                  marginTop:
                    '8px',
                  fontSize:
                    '30px'
                }}
              >
                {mySellerProducts.length}
              </strong>
            </div>

            <div
              style={{
                background:
                  '#fff',
                border:
                  '1px solid #eee',
                borderRadius:
                  '18px',
                padding:
                  '22px'
              }}
            >
              <span
                style={{
                  color:
                    '#777',
                  fontSize:
                    '13px'
                }}
              >
                🛒 Commandes
              </span>

              <strong
                style={{
                  display:
                    'block',
                  marginTop:
                    '8px',
                  fontSize:
                    '30px'
                }}
              >
                {sellerOrders.length}
              </strong>
            </div>

            <div
              style={{
                background:
                  '#fff',
                border:
                  '1px solid #eee',
                borderRadius:
                  '18px',
                padding:
                  '22px'
              }}
            >
              <span
                style={{
                  color:
                    '#777',
                  fontSize:
                    '13px'
                }}
              >
                📊 Ventes
              </span>

              <strong
                style={{
                  display:
                    'block',
                  marginTop:
                    '8px',
                  fontSize:
                    '30px'
                }}
              >
                {sellerSales.length}
              </strong>
            </div>

            <div
              style={{
                background:
                  '#fff',
                border:
                  '1px solid #eee',
                borderRadius:
                  '18px',
                padding:
                  '22px'
              }}
            >
              <span
                style={{
                  color:
                    '#777',
                  fontSize:
                    '13px'
                }}
              >
                💰 Chiffre d'affaires
              </span>

              <strong
                style={{
                  display:
                    'block',
                  marginTop:
                    '8px',
                  fontSize:
                    '25px',
                  color:
                    '#f97316'
                }}
              >
                0 FCFA
              </strong>
            </div>
          </div>

          <div
            style={{
              marginTop:
                '20px',
              background:
                '#fff',
              border:
                '1px solid #eee',
              borderRadius:
                '20px',
              padding:
                '35px',
              textAlign:
                'center'
            }}
          >
            <div
              style={{
                fontSize:
                  '55px'
              }}
            >
              📈
            </div>

            <h2>
              Les graphiques apparaîtront ici
            </h2>

            <p
              style={{
                color:
                  '#777',
                maxWidth:
                  '550px',
                margin:
                  '0 auto',
                lineHeight:
                  '1.6'
              }}
            >
              Nous connecterons ensuite cette partie aux données réelles de votre boutique pour afficher l'évolution des ventes, les produits les plus vendus et les revenus.
            </p>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PARAMÈTRES VENDEUR
  // =====================================================

  if (
    currentPage ===
      'seller-settings' &&
    sellerCreated
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '900px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerDashboard
            }
          >
            ← Tableau de bord vendeur
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              border:
                '1px solid #eee',
              borderRadius:
                '22px',
              padding:
                '30px'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              ⚙️ PARAMÈTRES
            </span>

            <h1
              style={{
                margin:
                  '18px 0 8px',
                color:
                  '#111'
              }}
            >
              Paramètres vendeur
            </h1>

            <p
              style={{
                color:
                  '#777',
                lineHeight:
                  '1.6'
              }}
            >
              Gérez les informations principales de votre boutique.
            </p>

            <div
              style={{
                marginTop:
                  '25px'
              }}
            >
              <div className="form-group">
                <label>
                  Nom de la boutique
                </label>

                <input
                  type="text"
                  name="shopName"
                  value={
                    sellerInfo.shopName
                  }
                  onChange={
                    handleSellerChange
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Description
                </label>

                <textarea
                  name="description"
                  value={
                    sellerInfo.description
                  }
                  onChange={
                    handleSellerChange
                  }
                  rows="4"
                ></textarea>
              </div>

              <div className="form-group">
                <label>
                  Localisation
                </label>

                <input
                  type="text"
                  name="location"
                  value={
                    sellerInfo.location
                  }
                  onChange={
                    handleSellerChange
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Téléphone professionnel
                </label>

                <input
                  type="tel"
                  name="phone"
                  value={
                    sellerInfo.phone
                  }
                  onChange={
                    handleSellerChange
                  }
                />
              </div>

              <div
                style={{
                  marginTop:
                    '20px',
                  padding:
                    '16px',
                  borderRadius:
                    '14px',
                  background:
                    '#fff7ed',
                  border:
                    '1px solid #fed7aa',
                  color:
                    '#7c2d12',
                  fontSize:
                    '14px',
                  lineHeight:
                    '1.5'
                }}
              >
                ℹ️ Les modifications sont
                actuellement conservées
                pendant cette session.
                La sauvegarde Firebase
                sera ajoutée ensuite.
              </div>
            </div>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE AJOUTER UN ARTICLE
  // =====================================================

  if (
    currentPage ===
    'add-product'
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '900px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToSellerProducts
            }
          >
            ← Retour à mes produits
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              borderRadius:
                '24px',
              padding:
                '30px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.08)',
              border:
                '1px solid #eee'
            }}
          >
            <div
              style={{
                textAlign:
                  'center',
                marginBottom:
                  '30px'
              }}
            >
              <span
                style={{
                  display:
                    'inline-block',
                  background:
                    '#fff3e8',
                  color:
                    '#f97316',
                  padding:
                    '7px 12px',
                  borderRadius:
                    '20px',
                  fontSize:
                    '12px',
                  fontWeight:
                    '700'
                }}
              >
                📦 PRODUIT
              </span>

              <h1
                style={{
                  margin:
                    '18px 0 10px',
                  color:
                    '#111',
                  fontSize:
                    '30px'
                }}
              >
                Ajouter un article
              </h1>

              <p
                style={{
                  margin:
                    '0 auto',
                  maxWidth:
                    '600px',
                  color:
                    '#777',
                  lineHeight:
                    '1.6'
                }}
              >
                Ajoutez une photo et
                les informations de
                votre article pour le
                mettre en ligne sur
                BABI-BABA.
              </p>
            </div>

            <form
              onSubmit={
                handlePublishProduct
              }
            >
              <div className="form-group">
                <label>
                  📸 Photo de l'article *
                </label>

                <div
                  style={{
                    border:
                      '2px dashed #ddd',
                    borderRadius:
                      '18px',
                    padding:
                      '20px',
                    textAlign:
                      'center',
                    background:
                      '#fafafa'
                  }}
                >
                  {productForm.image ? (
                    <div>
                      <img
                        src={
                          productForm.image
                        }
                        alt="Aperçu du produit"
                        style={{
                          width:
                            '100%',
                          maxWidth:
                            '350px',
                          height:
                            '250px',
                          objectFit:
                            'cover',
                          borderRadius:
                            '14px',
                          display:
                            'block',
                          margin:
                            '0 auto 15px'
                        }}
                      />

                      <label
                        style={{
                          display:
                            'inline-block',
                          padding:
                            '11px 16px',
                          background:
                            '#fff',
                          border:
                            '1px solid #ddd',
                          borderRadius:
                            '10px',
                          color:
                            '#333',
                          fontWeight:
                            '600',
                          cursor:
                            'pointer'
                        }}
                      >
                        🔄 Changer la photo

                        <input
                          type="file"
                          accept="image/*"
                          onChange={
                            handleProductImageChange
                          }
                          style={{
                            display:
                              'none'
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label
                      style={{
                        display:
                          'block',
                        cursor:
                          'pointer',
                        padding:
                          '30px 15px'
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            '55px',
                          marginBottom:
                            '12px'
                        }}
                      >
                        📸
                      </div>

                      <strong
                        style={{
                          display:
                            'block',
                          color:
                            '#222',
                          fontSize:
                            '16px'
                        }}
                      >
                        Ajouter une photo
                      </strong>

                      <span
                        style={{
                          display:
                            'block',
                          marginTop:
                            '6px',
                          color:
                            '#888',
                          fontSize:
                            '13px'
                        }}
                      >
                        Depuis votre téléphone ou votre ordinateur
                      </span>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={
                          handleProductImageChange
                        }
                        style={{
                          display:
                            'none'
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Nom de l'article *
                </label>

                <input
                  type="text"
                  name="name"
                  value={
                    productForm.name
                  }
                  onChange={
                    handleProductChange
                  }
                  placeholder="Ex : Robe élégante"
                />
              </div>

              <div className="form-group">
                <label>
                  Prix *
                </label>

                <input
                  type="number"
                  name="price"
                  value={
                    productForm.price
                  }
                  onChange={
                    handleProductChange
                  }
                  placeholder="Ex : 25000"
                  min="0"
                />

                <small
                  style={{
                    display:
                      'block',
                    marginTop:
                      '6px',
                    color:
                      '#888'
                  }}
                >
                  Prix en FCFA
                </small>
              </div>

              <div className="form-group">
                <label>
                  Catégorie *
                </label>

                <select
                  name="category"
                  value={
                    productForm.category
                  }
                  onChange={
                    handleProductChange
                  }
                >
                  <option value="">
                    Sélectionner une catégorie
                  </option>

                  <option value="Mode">
                    👕 Mode
                  </option>

                  <option value="Électronique">
                    📱 Électronique
                  </option>

                  <option value="Chaussures">
                    👟 Chaussures
                  </option>

                  <option value="Beauté">
                    💄 Beauté
                  </option>

                  <option value="Maison">
                    🏠 Maison
                  </option>

                  <option value="Alimentation">
                    🍎 Alimentation
                  </option>

                  <option value="Autres">
                    📦 Autres
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  Quantité disponible *
                </label>

                <input
                  type="number"
                  name="quantity"
                  value={
                    productForm.quantity
                  }
                  onChange={
                    handleProductChange
                  }
                  placeholder="Ex : 10"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>
                  Description
                </label>

                <textarea
                  name="description"
                  value={
                    productForm.description
                  }
                  onChange={
                    handleProductChange
                  }
                  placeholder="Décrivez votre article..."
                  rows="5"
                ></textarea>
              </div>

              <div
                style={{
                  marginTop:
                    '20px',
                  padding:
                    '16px',
                  borderRadius:
                    '14px',
                  background:
                    '#fff7ed',
                  border:
                    '1px solid #fed7aa',
                  color:
                    '#7c2d12',
                  lineHeight:
                    '1.5',
                  fontSize:
                    '14px'
                }}
              >
                💡 Votre article sera
                publié gratuitement sur
                BABI-BABA.
              </div>

              <button
                type="submit"
                className="checkout-button"
                style={{
                  marginTop:
                    '25px'
                }}
              >
                🟠 Publier mon article
              </button>
            </form>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE MES COMMANDES CLIENT
  // =====================================================

  if (
    currentPage ===
    'orders'
  ) {
    return (
      <div>
        <MainHeader />

        <main
          style={{
            maxWidth:
              '1000px',
            margin:
              '0 auto',
            padding:
              '35px 20px 100px'
          }}
        >
          <button
            className="back-button"
            onClick={
              goToHome
            }
          >
            ← Retour à l'accueil
          </button>

          <div
            style={{
              marginTop:
                '25px',
              background:
                '#fff',
              borderRadius:
                '24px',
              padding:
                '35px 25px',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.08)',
              border:
                '1px solid #eee',
              textAlign:
                'center'
            }}
          >
            <span
              style={{
                display:
                  'inline-block',
                background:
                  '#fff3e8',
                color:
                  '#f97316',
                padding:
                  '7px 12px',
                borderRadius:
                  '20px',
                fontSize:
                  '12px',
                fontWeight:
                  '700'
              }}
            >
              📦 MON HISTORIQUE
            </span>

            <h1
              style={{
                margin:
                  '18px 0 10px',
                color:
                  '#111',
                fontSize:
                  '30px'
              }}
            >
              Mes commandes
            </h1>

            <p
              style={{
                margin:
                  '0 auto',
                maxWidth:
                  '550px',
                color:
                  '#777',
                lineHeight:
                  '1.6'
              }}
            >
              Retrouvez ici vos commandes passées sur BABI-BABA.
            </p>

            {orders.length === 0 ? (
            <div
              style={{
                marginTop:
                  '35px',
                padding:
                  '35px 20px',
                background:
                  '#fafafa',
                borderRadius:
                  '18px',
                border:
                  '1px dashed #ddd'
              }}
            >
              <div
                style={{
                  fontSize:
                    '55px',
                  marginBottom:
                    '15px'
                }}
              >
                📦
              </div>

              <h2
                style={{
                  margin:
                    '0 0 10px',
                  color:
                    '#222',
                  fontSize:
                    '21px'
                }}
              >
                Aucune commande pour le moment
              </h2>

              <p
                style={{
                  margin:
                    '0 auto',
                  maxWidth:
                    '450px',
                  color:
                    '#777',
                  lineHeight:
                    '1.5',
                  fontSize:
                    '14px'
                }}
              >
                Vos commandes apparaîtront ici dès que vous aurez effectué votre premier achat sur BABI-BABA.
              </p>

              <button
                className="continue-shopping-button"
                onClick={
                  goToHome
                }
                style={{
                  marginTop:
                    '25px'
                }}
              >
                🛍️ Commencer mes achats
              </button>
            </div>
          ) : (
            <div>
              {orders.map((order) =>
                renderOrderCard(order, false)
              )}
            </div>
          )}
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE PAIEMENT
  // =====================================================

  if (
    currentPage ===
    'payment'
  ) {
    return (
      <div>
        <MainHeader />

        <main className="order-page">
          <button
            className="back-button"
            onClick={
              goToOrder
            }
          >
            ← Retour à la commande
          </button>

          <div className="order-page-header">
            <span className="cart-page-badge">
              💳 Paiement
            </span>

            <h1>
              Finaliser mon paiement
            </h1>

            <p>
              Vérifiez votre commande avant de procéder au paiement.
            </p>
          </div>

          <div className="order-layout">
            <section className="order-form-card">
              <div className="order-section-title">
                <span>💳</span>

                <div>
                  <h2>
                    Mode de paiement
                  </h2>

                  <p>
                    Choisissez votre moyen de paiement.
                  </p>
                </div>
              </div>

              <div className="delivery-options">
                <label className={`delivery-option ${paymentMethod === 'orange' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'orange'}
                    onChange={() => setPaymentMethod('orange')}
                  />

                  <div className="delivery-option-content">
                    <strong>
                      🟠 Orange Money
                    </strong>

                    <span>
                      Paiement mobile
                    </span>
                  </div>
                </label>

                <label className={`delivery-option ${paymentMethod === 'mtn' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'mtn'}
                    onChange={() => setPaymentMethod('mtn')}
                  />

                  <div className="delivery-option-content">
                    <strong>
                      🟡 MTN Mobile Money
                    </strong>

                    <span>
                      Paiement mobile
                    </span>
                  </div>
                </label>

                <label className={`delivery-option ${paymentMethod === 'wave' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'wave'}
                    onChange={() => setPaymentMethod('wave')}
                  />

                  <div className="delivery-option-content">
                    <strong>
                      🔵 Wave
                    </strong>

                    <span>
                      Paiement mobile
                    </span>
                  </div>
                </label>
              </div>

              <div className="order-section-title delivery-title">
                <span>📦</span>

                <div>
                  <h2>
                    Livraison / expédition
                  </h2>

                  <p>
                    Informations concernant la réception.
                  </p>
                </div>
              </div>

              <div className="payment-address-box">
                <strong>
                  {orderInfo.name}
                </strong>

                <span>
                  📞 {orderInfo.phone}
                </span>

                <span>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? '🚚 Livraison à Abidjan'
                    : '📦 Expédition nationale en Côte d’Ivoire'}
                </span>

                <span>
                  📍 {orderInfo.city}
                </span>

                <span>
                  {orderInfo.address}
                </span>

                <span>
                  {orderInfo.delivery ===
                  'express'
                    ? '⚡ Livraison / expédition express'
                    : '🚚 Livraison / expédition standard'}
                </span>

                <span>
                  🚚{' '}
                  {orderInfo.driverChoice ===
                  'client'
                    ? selectedDriver
                      ? `Livreur choisi : ${selectedDriver.name}`
                      : 'Livreur à choisir'
                    : 'Livreur choisi par le commerçant'}
                </span>
              </div>

              <button
                className="checkout-button"
                onClick={handlePlaceOrder}
                disabled={placingOrder}
              >
                {placingOrder
                  ? 'Enregistrement...'
                  : `✅ Confirmer la commande · ${orderTotal.toLocaleString(
                      'fr-FR'
                    )} FCFA`}
              </button>

              <p
                style={{
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#777',
                  lineHeight: '1.5'
                }}
              >
                Le paiement en ligne n'est pas encore activé : le règlement
                par Mobile Money se fait directement avec le vendeur.
              </p>
            </section>

            <aside className="order-summary">
              <h2>
                Votre commande
              </h2>

              <div className="order-products">
                {cart.map(
                  (
                    product,
                    index
                  ) => (
                    <div
                      className="order-product"
                      key={`${product.name}-${index}`}
                    >
                      <div className="order-product-image">
                        {product.image ? (
                          <img
                            src={
                              product.image
                            }
                            alt={
                              product.name
                            }
                            style={{
                              width:
                                '100%',
                              height:
                                '100%',
                              objectFit:
                                'cover',
                              borderRadius:
                                '10px'
                            }}
                          />
                        ) : (
                          getProductEmoji(
                            product.name
                          )
                        )}
                      </div>

                      <div className="order-product-info">
                        <h3>
                          {
                            product.name
                          }
                        </h3>

                        <p>
                          🏪{' '}
                          {
                            product.shop
                          }
                        </p>

                        <strong>
                          {product.price.toLocaleString(
                            'fr-FR'
                          )}{' '}
                          FCFA
                        </strong>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="summary-divider"></div>

              <div className="summary-line">
                <span>
                  Sous-total
                </span>

                <strong>
                  {cartTotal.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>

              <div className="summary-line">
                <span>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? 'Livraison'
                    : 'Expédition'}
                </span>

                <strong>
                  {deliveryFee.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>

              <div className="summary-line">
                <span>
                  Livreur
                </span>

                <span>
                  {orderInfo.driverChoice ===
                  'client'
                    ? selectedDriver
                      ? selectedDriver.name
                      : 'À choisir'
                    : 'Choisi par le commerçant'}
                </span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span>
                  Total
                </span>

                <strong>
                  {orderTotal.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>
            </aside>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE COMMANDE
  // =====================================================

  if (
    currentPage ===
    'order'
  ) {
    return (
      <div>
        <MainHeader />

        <main className="order-page">
          <button
            className="back-button"
            onClick={
              goToCart
            }
          >
            ← Retour au panier
          </button>

          <div className="order-page-header">
            <span className="cart-page-badge">
              📦 Finalisation de la commande
            </span>

            <h1>
              Passer ma commande
            </h1>

            <p>
              Indiquez vos informations pour recevoir votre commande.
            </p>
          </div>

          <div className="order-layout">
            <section className="order-form-card">
              <div className="order-section-title">
                <span>👤</span>

                <div>
                  <h2>
                    Vos informations
                  </h2>

                  <p>
                    Ces informations serviront pour la livraison.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label>
                  Nom complet
                </label>

                <input
                  type="text"
                  name="name"
                  value={
                    orderInfo.name
                  }
                  onChange={
                    handleOrderChange
                  }
                  placeholder="Ex : Ousmane Doumbia"
                />
              </div>

              <div className="form-group">
                <label>
                  Numéro de téléphone
                </label>

                <input
                  type="tel"
                  name="phone"
                  value={
                    orderInfo.phone
                  }
                  onChange={
                    handleOrderChange
                  }
                  placeholder="Ex : 07 00 00 00 00"
                />
              </div>

              <div className="order-section-title delivery-title">
                <span>📍</span>

                <div>
                  <h2>
                    Mode de réception
                  </h2>

                  <p>
                    Choisissez comment vous souhaitez recevoir votre commande.
                  </p>
                </div>
              </div>

              <div className="delivery-options">
                <label
                  className={
                    orderInfo.deliveryZone ===
                    'abidjan'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                >
                  <input
                    type="radio"
                    name="deliveryZone"
                    value="abidjan"
                    checked={
                      orderInfo.deliveryZone ===
                      'abidjan'
                    }
                    onChange={
                      handleOrderChange
                    }
                  />

                  <div className="delivery-option-content">
                    <strong>
                      🚚 LIVRAISON À ABIDJAN
                    </strong>

                    <span>
                      Recevez votre commande directement à Abidjan.
                    </span>
                  </div>
                </label>

                <label
                  className={
                    orderInfo.deliveryZone ===
                    'national'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                >
                  <input
                    type="radio"
                    name="deliveryZone"
                    value="national"
                    checked={
                      orderInfo.deliveryZone ===
                      'national'
                    }
                    onChange={(
                      event
                    ) => {
                      handleOrderChange(
                        event
                      );

                      setOrderInfo(
                        (
                          currentInfo
                        ) => ({
                          ...currentInfo,
                          city: ''
                        })
                      );
                    }}
                  />

                  <div className="delivery-option-content">
                    <strong>
                      📦 EXPÉDITION EN CÔTE D'IVOIRE
                    </strong>

                    <span>
                      Faites expédier votre commande vers une autre ville de Côte d'Ivoire.
                    </span>
                  </div>
                </label>
              </div>

              <div className="form-group">
                <label>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? 'Commune'
                    : 'Ville de destination'}
                </label>

                <select
                  name="city"
                  value={
                    orderInfo.city
                  }
                  onChange={
                    handleOrderChange
                  }
                >
                  <option value="">
                    {orderInfo.deliveryZone ===
                    'abidjan'
                      ? 'Sélectionner une commune'
                      : 'Sélectionner une ville'}
                  </option>

                  {orderInfo.deliveryZone ===
                  'abidjan' ? (
                    <>
                      <option value="Cocody">
                        Cocody
                      </option>
                      <option value="Marcory">
                        Marcory
                      </option>
                      <option value="Yopougon">
                        Yopougon
                      </option>
                      <option value="Abobo">
                        Abobo
                      </option>
                      <option value="Adjamé">
                        Adjamé
                      </option>
                      <option value="Plateau">
                        Plateau
                      </option>
                      <option value="Treichville">
                        Treichville
                      </option>
                      <option value="Port-Bouët">
                        Port-Bouët
                      </option>
                      <option value="Koumassi">
                        Koumassi
                      </option>
                      <option value="Bingerville">
                        Bingerville
                      </option>
                      <option value="Anyama">
                        Anyama
                      </option>
                    </>
                  ) : (
                    <>
                      <option value="Bouaké">
                        Bouaké
                      </option>
                      <option value="Yamoussoukro">
                        Yamoussoukro
                      </option>
                      <option value="San-Pédro">
                        San-Pédro
                      </option>
                      <option value="Korhogo">
                        Korhogo
                      </option>
                      <option value="Daloa">
                        Daloa
                      </option>
                      <option value="Man">
                        Man
                      </option>
                      <option value="Gagnoa">
                        Gagnoa
                      </option>
                      <option value="Abengourou">
                        Abengourou
                      </option>
                      <option value="Grand-Bassam">
                        Grand-Bassam
                      </option>
                      <option value="Aboisso">
                        Aboisso
                      </option>
                      <option value="Divo">
                        Divo
                      </option>
                      <option value="Odienné">
                        Odienné
                      </option>
                      <option value="Séguéla">
                        Séguéla
                      </option>
                      <option value="Bondoukou">
                        Bondoukou
                      </option>
                      <option value="Ferkessédougou">
                        Ferkessédougou
                      </option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? 'Adresse / lieu de livraison'
                    : 'Adresse / lieu de réception'}
                </label>

                <textarea
                  name="address"
                  value={
                    orderInfo.address
                  }
                  onChange={
                    handleOrderChange
                  }
                  placeholder={
                    orderInfo.deliveryZone ===
                    'abidjan'
                      ? 'Ex : Riviera 2, près de...'
                      : 'Ex : Quartier, rue, repère, gare ou point de réception...'
                  }
                  rows="4"
                ></textarea>
              </div>

              <div className="order-section-title delivery-title">
                <span>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? '🚚'
                    : '📦'}
                </span>

                <div>
                  <h2>
                    {orderInfo.deliveryZone ===
                    'abidjan'
                      ? 'Mode de livraison'
                      : 'Mode d’expédition'}
                  </h2>

                  <p>
                    Choisissez la vitesse de réception.
                  </p>
                </div>
              </div>

              <div className="delivery-options">
                <label
                  className={
                    orderInfo.delivery ===
                    'standard'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                >
                  <input
                    type="radio"
                    name="delivery"
                    value="standard"
                    checked={
                      orderInfo.delivery ===
                      'standard'
                    }
                    onChange={
                      handleOrderChange
                    }
                  />

                  <div className="delivery-option-content">
                    <strong>
                      {orderInfo.deliveryZone ===
                      'abidjan'
                        ? '🚚 Livraison standard'
                        : '📦 Expédition standard'}
                    </strong>

                    <span>
                      {orderInfo.deliveryZone ===
                      'abidjan'
                        ? 'Livraison normale à Abidjan'
                        : 'Expédition vers votre ville'}
                    </span>
                  </div>

                  <strong>
                    {orderInfo.deliveryZone ===
                    'abidjan'
                      ? '1 500 FCFA'
                      : '3 500 FCFA'}
                  </strong>
                </label>

                <label
                  className={
                    orderInfo.delivery ===
                    'express'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                >
                  <input
                    type="radio"
                    name="delivery"
                    value="express"
                    checked={
                      orderInfo.delivery ===
                      'express'
                    }
                    onChange={
                      handleOrderChange
                    }
                  />

                  <div className="delivery-option-content">
                    <strong>
                      {orderInfo.deliveryZone ===
                      'abidjan'
                        ? '⚡ Livraison express'
                        : '⚡ Expédition express'}
                    </strong>

                    <span>
                      {orderInfo.deliveryZone ===
                      'abidjan'
                        ? 'Livraison prioritaire'
                        : 'Expédition prioritaire'}
                    </span>
                  </div>

                  <strong>
                    {orderInfo.deliveryZone ===
                    'abidjan'
                      ? '3 000 FCFA'
                      : '5 000 FCFA'}
                  </strong>
                </label>
              </div>

              <div className="order-section-title delivery-title">
                <span>🚚</span>

                <div>
                  <h2>
                    Choix du livreur
                  </h2>

                  <p>
                    Choisissez qui sélectionnera le livreur pour votre commande.
                  </p>
                </div>
              </div>

              <div className="delivery-options">
                <label
                  className={
                    orderInfo.driverChoice ===
                    'client'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                  onClick={() =>
                    handleDriverChoiceChange(
                      'client'
                    )
                  }
                  style={{
                    cursor:
                      'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="driverChoice"
                    value="client"
                    checked={
                      orderInfo.driverChoice ===
                      'client'
                    }
                    onChange={() =>
                      handleDriverChoiceChange(
                        'client'
                      )
                    }
                  />

                  <div className="delivery-option-content">
                    <strong>
                      👤 Je choisis mon livreur
                    </strong>

                    <span>
                      Choisissez directement un livreur disponible.
                    </span>
                  </div>
                </label>

                <label
                  className={
                    orderInfo.driverChoice ===
                    'seller'
                      ? 'delivery-option selected'
                      : 'delivery-option'
                  }
                  onClick={() =>
                    handleDriverChoiceChange(
                      'seller'
                    )
                  }
                  style={{
                    cursor:
                      'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="driverChoice"
                    value="seller"
                    checked={
                      orderInfo.driverChoice ===
                      'seller'
                    }
                    onChange={() =>
                      handleDriverChoiceChange(
                        'seller'
                      )
                    }
                  />

                  <div className="delivery-option-content">
                    <strong>
                      🏪 Le commerçant choisit
                    </strong>

                    <span>
                      Le vendeur choisira un livreur disponible pour vous.
                    </span>
                  </div>
                </label>
              </div>

              {orderInfo.driverChoice ===
                'client' && (
                <div
                  style={{
                    marginTop:
                      '18px',
                    padding:
                      '18px',
                    background:
                      '#fafafa',
                    border:
                      '1px solid #eee',
                    borderRadius:
                      '16px'
                  }}
                >
                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'space-between',
                      gap:
                        '10px',
                      marginBottom:
                        '15px',
                      flexWrap:
                        'wrap'
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          display:
                            'block',
                          color:
                            '#111',
                          fontSize:
                            '16px'
                        }}
                      >
                        🟢 Livreurs disponibles
                      </strong>

                      <span
                        style={{
                          display:
                            'block',
                          marginTop:
                            '4px',
                          color:
                            '#777',
                          fontSize:
                            '13px'
                        }}
                      >
                        Sélectionnez votre livreur.
                      </span>
                    </div>

                    <span
                      style={{
                        background:
                          '#e9f8ef',
                        color:
                          '#18864b',
                        padding:
                          '6px 10px',
                        borderRadius:
                          '20px',
                        fontSize:
                          '12px',
                        fontWeight:
                          '700'
                      }}
                    >
                      {
                        availableDrivers.length
                      }{' '}
                      disponibles
                    </span>
                  </div>

                  <div
                    style={{
                      display:
                        'grid',
                      gap:
                        '12px'
                    }}
                  >
                    {availableDrivers.map(
                      (
                        driver
                      ) => {
                        const isSelected =
                          orderInfo.selectedDriver ===
                          driver.id;

                        return (
                          <button
                            key={
                              driver.id
                            }
                            type="button"
                            onClick={() =>
                              handleDriverSelect(
                                driver.id
                              )
                            }
                            style={{
                              width:
                                '100%',
                              display:
                                'flex',
                              alignItems:
                                'center',
                              gap:
                                '12px',
                              padding:
                                '14px',
                              border:
                                isSelected
                                  ? '2px solid #f97316'
                                  : '1px solid #e5e5e5',
                              borderRadius:
                                '14px',
                              background:
                                isSelected
                                  ? '#fff7ed'
                                  : '#fff',
                              cursor:
                                'pointer',
                              textAlign:
                                'left'
                            }}
                          >
                            <div
                              style={{
                                width:
                                  '48px',
                                height:
                                  '48px',
                                borderRadius:
                                  '50%',
                                background:
                                  '#f3f3f3',
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                fontSize:
                                  '25px',
                                flexShrink:
                                  0
                              }}
                            >
                              {
                                driver.emoji
                              }
                            </div>

                            <div
                              style={{
                                flex: 1,
                                minWidth:
                                  0
                              }}
                            >
                              <strong
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#111',
                                  fontSize:
                                    '15px'
                                }}
                              >
                                {
                                  driver.name
                                }
                              </strong>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#666',
                                  fontSize:
                                    '13px',
                                  marginTop:
                                    '3px'
                                }}
                              >
                                📍{' '}
                                {
                                  driver.zone
                                }
                              </span>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#777',
                                  fontSize:
                                    '12px',
                                  marginTop:
                                    '3px'
                                }}
                              >
                                ⭐{' '}
                                {
                                  driver.rating
                                }{' '}
                                ·{' '}
                                {
                                  driver.deliveries
                                }{' '}
                                livraisons
                              </span>
                            </div>

                            <div
                              style={{
                                width:
                                  '24px',
                                height:
                                  '24px',
                                borderRadius:
                                  '50%',
                                border:
                                  isSelected
                                    ? '7px solid #f97316'
                                    : '2px solid #ccc',
                                background:
                                  '#fff',
                                flexShrink:
                                  0
                              }}
                            ></div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {orderInfo.driverChoice ===
                'seller' && (
                <div
                  style={{
                    marginTop:
                      '18px',
                    padding:
                      '16px',
                    borderRadius:
                      '14px',
                    background:
                      '#fff7ed',
                    border:
                      '1px solid #fed7aa'
                  }}
                >
                  <strong
                    style={{
                      display:
                        'block',
                      color:
                        '#9a3412',
                      marginBottom:
                        '5px'
                    }}
                  >
                    🏪 Le commerçant choisira le livreur
                  </strong>

                  <span
                    style={{
                      color:
                        '#7c2d12',
                      fontSize:
                        '13px',
                      lineHeight:
                        '1.5'
                    }}
                  >
                    Vous laissez le vendeur sélectionner un livreur disponible pour effectuer votre livraison.
                  </span>
                </div>
              )}
            </section>

            <aside className="order-summary">
              <h2>
                Récapitulatif
              </h2>

              <div className="order-products">
                {cart.map(
                  (
                    product,
                    index
                  ) => (
                    <div
                      className="order-product"
                      key={`${product.name}-${index}`}
                    >
                      <div className="order-product-image">
                        {product.image ? (
                          <img
                            src={
                              product.image
                            }
                            alt={
                              product.name
                            }
                            style={{
                              width:
                                '100%',
                              height:
                                '100%',
                              objectFit:
                                'cover',
                              borderRadius:
                                '10px'
                            }}
                          />
                        ) : (
                          getProductEmoji(
                            product.name
                          )
                        )}
                      </div>

                      <div className="order-product-info">
                        <h3>
                          {
                            product.name
                          }
                        </h3>

                        <p>
                          🏪{' '}
                          {
                            product.shop
                          }
                        </p>

                        <strong>
                          {product.price.toLocaleString(
                            'fr-FR'
                          )}{' '}
                          FCFA
                        </strong>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="summary-divider"></div>

              <div className="summary-line">
                <span>
                  Sous-total
                </span>

                <strong>
                  {cartTotal.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>

              <div className="summary-line">
                <span>
                  {orderInfo.deliveryZone ===
                  'abidjan'
                    ? 'Livraison'
                    : 'Expédition'}
                </span>

                <strong>
                  {deliveryFee.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>

              <div className="summary-line">
                <span>
                  Livreur
                </span>

                <span
                  style={{
                    textAlign:
                      'right',
                    maxWidth:
                      '180px'
                  }}
                >
                  {orderInfo.driverChoice ===
                  'client'
                    ? selectedDriver
                      ? `👤 ${selectedDriver.name}`
                      : '⚠️ À choisir'
                    : '🏪 Choisi par le commerçant'}
                </span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span>
                  Total
                </span>

                <strong>
                  {orderTotal.toLocaleString(
                    'fr-FR'
                  )}{' '}
                  FCFA
                </strong>
              </div>

              <button
                className="checkout-button"
                onClick={
                  goToPayment
                }
              >
                💳 Continuer vers le paiement
              </button>

              <button
                className="continue-shopping-button secondary"
                onClick={
                  goToCart
                }
              >
                ← Modifier mon panier
              </button>
            </aside>
          </div>
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // PAGE PANIER
  // =====================================================

  if (
    currentPage ===
    'cart'
  ) {
    return (
      <div>
        <MainHeader />

        <main className="cart-page">
          <button
            className="back-button"
            onClick={
              goToHome
            }
          >
            ← Retour à l'accueil
          </button>

          <div className="cart-page-header">
            <div>
              <span className="cart-page-badge">
                🛒 Votre sélection
              </span>

              <h1>
                Mon panier
              </h1>

              <p>
                Vérifiez vos produits avant de passer votre commande.
              </p>
            </div>
          </div>

          {cart.length ===
          0 ? (
            <div className="empty-cart-page">
              <div className="empty-cart-icon">
                🛒
              </div>

              <h2>
                Votre panier est vide
              </h2>

              <p>
                Découvrez nos produits et ajoutez vos articles préférés.
              </p>

              <button
                className="continue-shopping-button"
                onClick={
                  goToHome
                }
              >
                🛍️ Continuer mes achats
              </button>
            </div>
          ) : (
            <div className="cart-page-layout">
              <section className="cart-products">
                <div className="cart-products-header">
                  <h2>
                    Produits sélectionnés
                  </h2>

                  <span>
                    {cart.length}{' '}
                    article
                    {cart.length >
                    1
                      ? 's'
                      : ''}
                  </span>
                </div>

                {cart.map(
                  (
                    product,
                    index
                  ) => (
                    <div
                      className="cart-page-item"
                      key={`${product.name}-${index}`}
                    >
                      <div className="cart-page-item-image">
                        {product.image ? (
                          <img
                            src={
                              product.image
                            }
                            alt={
                              product.name
                            }
                            style={{
                              width:
                                '100%',
                              height:
                                '100%',
                              objectFit:
                                'cover',
                              borderRadius:
                                '12px'
                            }}
                          />
                        ) : (
                          getProductEmoji(
                            product.name
                          )
                        )}
                      </div>

                      <div className="cart-page-item-info">
                        <h3>
                          {
                            product.name
                          }
                        </h3>

                        <p>
                          🏪{' '}
                          {
                            product.shop
                          }
                        </p>

                        <strong>
                          {product.price.toLocaleString(
                            'fr-FR'
                          )}{' '}
                          FCFA
                        </strong>
                      </div>

                      <button
                        className="remove-cart-item"
                        onClick={() =>
                          removeFromCart(
                            index
                          )
                        }
                      >
                        🗑️
                      </button>
                    </div>
                  )
                )}
              </section>

              <aside className="cart-summary">
                <h2>
                  Récapitulatif
                </h2>

                <div className="summary-line">
                  <span>
                    Sous-total
                  </span>

                  <strong>
                    {cartTotal.toLocaleString(
                      'fr-FR'
                    )}{' '}
                    FCFA
                  </strong>
                </div>

                <div className="summary-line">
                  <span>
                    Livraison / expédition
                  </span>

                  <span>
                    À calculer
                  </span>
                </div>

                <div className="summary-divider"></div>

                <div className="summary-total">
                  <span>
                    Total produits
                  </span>

                  <strong>
                    {cartTotal.toLocaleString(
                      'fr-FR'
                    )}{' '}
                    FCFA
                  </strong>
                </div>

                <button
                  className="checkout-button"
                  onClick={
                    goToOrder
                  }
                >
                  🛍️ Passer la commande
                </button>

                <button
                  className="continue-shopping-button secondary"
                  onClick={
                    goToHome
                  }
                >
                  ← Continuer mes achats
                </button>
              </aside>
            </div>
          )}
        </main>

        <LogoutConfirmation />
      </div>
    );
  }

  // =====================================================
  // ACCUEIL
  // =====================================================

  return (
    <div>
      <header className="main-header">
        <div className="header-top">
          <div
            className="logo"
            onClick={
              goToHome
            }
            style={{
              cursor:
                'pointer'
            }}
          >
            <span className="logo-icon">
              🐘
            </span>

            <span>
              BABI-BABA
            </span>
          </div>

          <div className="header-actions">
            <button>
              ❤️
            </button>

            <button>
              🔔
            </button>

            <button
              className="cart-icon"
              onClick={
                goToCart
              }
            >
              🛒

              {cart.length >
                0 && (
                <span className="cart-count">
                  {cart.length}
                </span>
              )}
            </button>

            <ProfileButton />
          </div>
        </div>

        <div className="header-search">
          <input
            type="text"
            placeholder="🔎 Rechercher un produit, une boutique..."
          />

          <button className="ai-search-button">
            🤖 IA Recherche
          </button>
        </div>

        <nav className="main-nav">
          <button
            onClick={
              goToHome
            }
          >
            🏠 Accueil
          </button>

          <button>
            🏷️ Catégories
          </button>

          <button>
            🔥 Populaires
          </button>

          <button>
            🏪 Boutiques
          </button>

          <button>
            🚚 Livraison
          </button>
        </nav>
      </header>

      <main>
        <div className="hero-content">
          <span className="hero-badge">
            🇨🇮 Le marché ivoirien
          </span>

          <h2>
            Tout ce que vous cherchez,
            <br />
            au même endroit.
          </h2>

          <p>
            Découvrez des produits,
            des boutiques et des
            vendeurs partout en
            Côte d’Ivoire.
          </p>
        </div>

        <section className="categories-section">
          <h2>
            🏷️ Catégories
          </h2>

          <div className="categories-grid">
            <div className="category-card">
              <span>👕</span>
              <strong>
                Mode
              </strong>
              <small>
                Vêtements &
                accessoires
              </small>
            </div>

            <div className="category-card">
              <span>📱</span>
              <strong>
                Électronique
              </strong>
              <small>
                Téléphones &
                appareils
              </small>
            </div>

            <div className="category-card">
              <span>👟</span>
              <strong>
                Chaussures
              </strong>
              <small>
                Pour tous les
                styles
              </small>
            </div>

            <div className="category-card">
              <span>💄</span>
              <strong>
                Beauté
              </strong>
              <small>
                Soins &
                cosmétiques
              </small>
            </div>

            <div className="category-card">
              <span>🏠</span>
              <strong>
                Maison
              </strong>
              <small>
                Maison &
                décoration
              </small>
            </div>

            <div className="category-card">
              <span>🍎</span>
              <strong>
                Alimentation
              </strong>
              <small>
                Produits
                alimentaires
              </small>
            </div>
          </div>
        </section>

        {/* =================================================
            PRODUITS VENDEURS
            ================================================= */}

        {sellerProducts.length >
          0 && (
          <section className="products-section">
            <h2>
              🆕 Articles des
              vendeurs
            </h2>

            <div className="products-grid">
              {sellerProducts.map(
                (
                  product
                ) => (
                  <div
                    className="product-card"
                    key={
                      product.id
                    }
                  >
                    <div
                      className="product-image"
                      style={{
                        overflow:
                          'hidden'
                      }}
                    >
                      <img
                        src={
                          product.image
                        }
                        alt={
                          product.name
                        }
                        style={{
                          width:
                            '100%',
                          height:
                            '100%',
                          objectFit:
                            'cover'
                        }}
                      />
                    </div>

                    <div className="product-info">
                      <h3>
                        {
                          product.name
                        }
                      </h3>

                      <p className="product-price">
                        {product.price.toLocaleString(
                          'fr-FR'
                        )}{' '}
                        FCFA
                      </p>

                      <p className="product-shop">
                        🏪{' '}
                        {
                          product.shop
                        }
                      </p>

                      <p
                        style={{
                          color:
                            '#777',
                          fontSize:
                            '13px'
                        }}
                      >
                        📂{' '}
                        {
                          product.category
                        }
                      </p>

                      {product.description && (
                        <p
                          style={{
                            color:
                              '#777',
                            fontSize:
                              '13px',
                            lineHeight:
                              '1.5'
                          }}
                        >
                          {
                            product.description
                          }
                        </p>
                      )}

                      <p className="product-rating">
                        📦{' '}
                        {
                          product.quantity
                        }{' '}
                        disponible
                        {product.quantity >
                        1
                          ? 's'
                          : ''}
                      </p>

                      <button
                        className="cart-button"
                        onClick={() =>
                          addSellerProductToCart(
                            product
                          )
                        }
                      >
                        🛒 Ajouter au panier
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* =================================================
            PRODUITS POPULAIRES
            ================================================= */}

        <section className="products-section">
          <h2>
            🔥 Produits populaires
          </h2>

          <div className="products-grid">
            <div className="product-card">
              <div className="product-image">
                👟
              </div>

              <div className="product-info">
                <h3>
                  Basket tendance
                </h3>

                <p className="product-price">
                  15 000 FCFA
                </p>

                <p className="product-shop">
                  🏪 Boutique
                  Style CI
                </p>

                <p className="product-rating">
                  ⭐ 4.8
                </p>

                <button
                  className="cart-button"
                  onClick={() =>
                    addToCart({
                      name: 'Basket tendance',
                      price: 15000,
                      shop: 'Boutique Style CI'
                    })
                  }
                >
                  🛒 Ajouter au panier
                </button>
              </div>
            </div>

            <div className="product-card">
              <div className="product-image">
                📱
              </div>

              <div className="product-info">
                <h3>
                  Smartphone Android
                </h3>

                <p className="product-price">
                  85 000 FCFA
                </p>

                <p className="product-shop">
                  🏪 Tech
                  Abidjan
                </p>

                <p className="product-rating">
                  ⭐ 4.6
                </p>

                <button
                  className="cart-button"
                  onClick={() =>
                    addToCart({
                      name: 'Smartphone Android',
                      price: 85000,
                      shop: 'Tech Abidjan'
                    })
                  }
                >
                  🛒 Ajouter au panier
                </button>
              </div>
            </div>

            <div className="product-card">
              <div className="product-image">
                👗
              </div>

              <div className="product-info">
                <h3>
                  Robe élégante
                </h3>

                <p className="product-price">
                  25 000 FCFA
                </p>

                <p className="product-shop">
                  🏪 Fashion
                  Cocody
                </p>

                <p className="product-rating">
                  ⭐ 4.9
                </p>

                <button
                  className="cart-button"
                  onClick={() =>
                    addToCart({
                      name: 'Robe élégante',
                      price: 25000,
                      shop: 'Fashion Cocody'
                    })
                  }
                >
                  🛒 Ajouter au panier
                </button>
              </div>
            </div>

            <div className="product-card">
              <div className="product-image">
                🎧
              </div>

              <div className="product-info">
                <h3>
                  Casque Bluetooth
                </h3>

                <p className="product-price">
                  12 500 FCFA
                </p>

                <p className="product-shop">
                  🏪 Digital
                  Store CI
                </p>

                <p className="product-rating">
                  ⭐ 4.7
                </p>

                <button
                  className="cart-button"
                  onClick={() =>
                    addToCart({
                      name: 'Casque Bluetooth',
                      price: 12500,
                      shop: 'Digital Store CI'
                    })
                  }
                >
                  🛒 Ajouter au panier
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            BOUTIQUES
            ================================================= */}

        <section className="shops-section">
          <h2>
            🏪 Boutiques à découvrir
          </h2>

          <div className="shops-grid">
            <div className="shop-card">
              <div className="shop-icon">
                👗
              </div>

              <div className="shop-info">
                <h3>
                  Fashion Cocody
                </h3>

                <p>
                  📍 Cocody,
                  Abidjan
                </p>

                <p>
                  ⭐ 4.9 · 124
                  produits
                </p>
              </div>

              <button>
                Voir la boutique →
              </button>
            </div>

            <div className="shop-card">
              <div className="shop-icon">
                📱
              </div>

              <div className="shop-info">
                <h3>
                  Tech Abidjan
                </h3>

                <p>
                  📍 Marcory,
                  Abidjan
                </p>

                <p>
                  ⭐ 4.8 · 87
                  produits
                </p>
              </div>

              <button>
                Voir la boutique →
              </button>
            </div>

            <div className="shop-card">
              <div className="shop-icon">
                💄
              </div>

              <div className="shop-info">
                <h3>
                  Beauty Palace
                  CI
                </h3>

                <p>
                  📍 Yopougon,
                  Abidjan
                </p>

                <p>
                  ⭐ 4.7 · 156
                  produits
                </p>
              </div>

              <button>
                Voir la boutique →
              </button>
            </div>

            {sellerCreated && (
              <div className="shop-card">
                <div className="shop-icon">
                  🏪
                </div>

                <div className="shop-info">
                  <h3>
                    {
                      sellerInfo.shopName
                    }
                  </h3>

                  <p>
                    📍{' '}
                    {
                      sellerInfo.location
                    }
                  </p>

                  <p>
                    📦{' '}
                    {
                      mySellerProducts.length
                    }{' '}
                    produit
                    {mySellerProducts.length >
                    1
                      ? 's'
                      : ''}
                  </p>
                </div>

                <button
                  onClick={
                    goToSellerDashboard
                  }
                >
                  Tableau de bord →
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <nav className="mobile-bottom-nav">
        <button
          className="active"
          onClick={
            goToHome
          }
        >
          <span>🏠</span>
          <small>
            Accueil
          </small>
        </button>

        <button>
          <span>🔎</span>
          <small>
            Explorer
          </small>
        </button>

        <button
          onClick={
            goToCart
          }
        >
          <span>🛒</span>
          <small>
            Panier
          </small>

          {cart.length >
            0 && (
            <span className="mobile-cart-count">
              {cart.length}
            </span>
          )}
        </button>

        <ProfileButton mobile />
      </nav>

      <LogoutConfirmation />
    </div>
  );
}

export default App;
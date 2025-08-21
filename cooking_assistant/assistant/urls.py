from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('search/', views.search_recipes, name='search_recipes'),
    path('modify/', views.modify_recipe, name='modify_recipe'),
    path('reset_session/', views.reset_session, name='reset_session'),
]